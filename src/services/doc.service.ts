import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { JwtPayload } from "../interfaces/jwt-payload.interface";
import { AppService } from "./app.service";
import { Customer } from "../entities/customer.entity";
import { Doc } from "../entities/doc.entity";
import { GlobalConstants } from "../constants/global.constants";
import * as PDFDocument from "pdfkit";
import * as JsBarcode from "jsbarcode";
import { DocStatus } from "src/enums/doc-status.enum";

@Injectable()
export class DocService {
  constructor(
    private readonly appService: AppService,
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    @InjectRepository(Doc)
    private readonly docRepository: Repository<Doc>
  ) {}

  async scanAndAdd(
    docId: string,
    lastScannedBy: string
  ): Promise<{ success: boolean; message: string; docId: string }> {
    // Check if document already exists in database
    const existingDoc = await this.docRepository.findOne({
      where: { id: docId },
    });
    if (existingDoc) {
      // Update existing document
      existingDoc.lastScannedBy = lastScannedBy;
      existingDoc.lastUpdatedAt = new Date();
      await this.docRepository.save(existingDoc);

      return {
        success: true,
        message: "Document updated successfully",
        docId: docId,
      };
    }

    // Get all mock docs from AppService
    const mockDocs = this.appService.getMockDocs();

    // Find the document with matching docId
    const foundDoc = mockDocs.find((doc) => doc.docId === docId);

    if (!foundDoc) {
      throw new NotFoundException(`No Document with ID ${docId} found in ERP`);
    }

    // Check if customer exists, create or update it
    let customer = await this.customerRepository.findOne({
      where: { id: foundDoc.customerId },
    });

    if (!customer) {
      // Create new customer record
      customer = this.customerRepository.create({
        id: foundDoc.customerId,
        firmName: foundDoc.customerName,
        address: foundDoc.customerAddress,
        city: foundDoc.customerCity,
        pincode: foundDoc.customerPinCode,
        geoLatitude: null, // No geo data for now
        geoLongitude: null, // No geo data for now
        createdAt: new Date(),
        lastUpdatedAt: new Date(),
      });
    } else {
      // Update existing customer record with latest details
      customer.firmName = foundDoc.customerName;
      customer.address = foundDoc.customerAddress;
      customer.city = foundDoc.customerCity;
      customer.pincode = foundDoc.customerPinCode;
      customer.lastUpdatedAt = new Date();
    }

    await this.customerRepository.save(customer);

    // Create new document record
    const newDoc = this.docRepository.create({
      id: foundDoc.docId,
      status: DocStatus.READY_FOR_DISPATCH,
      lastScannedBy: lastScannedBy,
      originWarehouse: foundDoc.whseLocationName,
      tripId: null, // No trip_id for now
      docDate: foundDoc.docDate,
      docAmount: foundDoc.docAmount,
      route: foundDoc.routeId,
      lot: foundDoc.lotNbr || null,
      customerId: foundDoc.customerId,
      createdAt: new Date(),
      lastUpdatedAt: new Date(),
    });

    await this.docRepository.save(newDoc);

    return {
      success: true,
      message: "Document added successfully",
      docId: docId,
    };
  }

  async purgeMockData(): Promise<{
    deletedDocs: number;
    deletedCustomers: number;
  }> {
    const mockPrefix = `${GlobalConstants.MOCK_CUSTOMER_PREFIX}%`;

    // First, delete all docs where customerId starts with the mock prefix
    const deletedDocs = await this.docRepository
      .createQueryBuilder()
      .delete()
      .where("customerId LIKE :prefix", { prefix: mockPrefix })
      .execute();

    // Then, delete all customers with the mock prefix
    const deletedCustomers = await this.customerRepository
      .createQueryBuilder()
      .delete()
      .where("id LIKE :prefix", { prefix: mockPrefix })
      .execute();

    // Clear mock data from AppService after successful database cleanup
    this.appService.clearMockDocs();

    return {
      deletedDocs: deletedDocs.affected || 0,
      deletedCustomers: deletedCustomers.affected || 0,
    };
  }

  async createMockData() {
    const mockDocs = [];

    // Sample data arrays for random selection

    const lotNumbers = ["LOT001", "LOT002", "LOT003", ""];
    const warehouseLocations = ["WH-Vytilla", "WH-Thodupuzha"];

    const customers = GlobalConstants.CUSTOMERS;

    // Generate 10 mock documents with 50% having blank status
    for (let i = 0; i < 10; i++) {
      const randomCustomer =
        customers[Math.floor(Math.random() * customers.length)];

      // Generate random 10-character numeric docId
      const generateDocId = () => {
        const chars = "0123456789";
        let result = "";
        for (let i = 0; i < 10; i++) {
          result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
      };

      // Generate docDate (today or yesterday)
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const docDate = Math.random() < 0.5 ? today : yesterday;

      // Generate docAmount (between 100.00 and 10000.00, excluding both)
      const docAmount = parseFloat((Math.random() * 9900 + 100.01).toFixed(2));

      const mockDoc = {
        docId: generateDocId(),
        status: "",
        routeId: randomCustomer.route,
        lotNbr: lotNumbers[Math.floor(Math.random() * lotNumbers.length)], // Can be blank
        whseLocationName:
          warehouseLocations[
            Math.floor(Math.random() * warehouseLocations.length)
          ],
        customerId: randomCustomer.id,
        customerName: randomCustomer.name,
        customerAddress: randomCustomer.address,
        customerCity: randomCustomer.city,
        customerPinCode: randomCustomer.pincode,
        docDate: docDate,
        docAmount: docAmount,
        invoiceDate: new Date(
          Date.now() - Math.floor(Math.random() * 30) * 24 * 60 * 60 * 1000
        ), // Random date within last 30 days
        invoiceAmount: parseFloat((Math.random() * 10000 + 100).toFixed(2)), // Random amount between 100 and 10100
      };

      mockDocs.push(mockDoc);
    }

    // Add all mock docs to app service
    this.appService.addMockDocs(mockDocs);

    // Generate PDF with barcodes
    const pdfBuffer = await this.generatePdfWithBarcodes(mockDocs);

    return {
      message: "Mock data created successfully",
      count: mockDocs.length,
      docs: mockDocs,
      pdfBuffer: pdfBuffer,
    };
  }

  private async generatePdfWithBarcodes(mockDocs: any[]): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50 });
        const buffers: Buffer[] = [];

        doc.on("data", (chunk) => buffers.push(chunk));
        doc.on("end", () => resolve(Buffer.concat(buffers)));
        doc.on("error", reject);

        // Add title
        doc.fontSize(20).text("Document Barcodes", { align: "center" });
        doc.moveDown(2);

        // Add each document with its barcode
        mockDocs.forEach((docData, index) => {
          // Add document info
          doc
            .fontSize(12)
            .text(`Document ${index + 1}:`, { underline: true })
            .text(`Doc ID: ${docData.docId}`)
            .text(`Customer: ${docData.customerName}`)
            .text(`Route: ${docData.routeId}`)
            .text(`Lot Number: ${docData.lotNbr || "Not assigned"}`)
            .text(`Doc Date: ${docData.docDate.toLocaleDateString()}`)
            .text(`Doc Amount: Rs. ${docData.docAmount}`)
            .text(`Status: ${docData.status || "Blank"}`)
            .moveDown(1);

          // Generate barcode
          const canvas = require("canvas").createCanvas(200, 50);
          JsBarcode(canvas, docData.docId, {
            format: "CODE128",
            width: 2,
            height: 40,
            displayValue: true,
            fontSize: 12,
            margin: 10,
          });

          // Add barcode to PDF
          const barcodeImage = canvas.toBuffer("image/png");
          doc.image(barcodeImage, { width: 200, height: 50 });
          doc.moveDown(2);

          // Add page break if not the last document
          if (index < mockDocs.length - 1) {
            doc.addPage();
          }
        });

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }
}
