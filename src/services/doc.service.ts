import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import * as JsBarcode from "jsbarcode";
import * as PDFDocument from "pdfkit";
import { DocStatus } from "src/enums/doc-status.enum";
import { DataSource, LoggerOptions, MoreThan, Repository } from "typeorm";

import { Customer } from "../entities/customer.entity";
import { Doc } from "../entities/doc.entity";
import { AppService } from "./app.service";
import { GlobalConstants } from "src/GlobalConstants";
import { JwtPayload } from "src/interfaces/jwt-payload.interface";

@Injectable()
export class DocService {
  constructor(
    private readonly appService: AppService,
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    @InjectRepository(Doc)
    private readonly docRepository: Repository<Doc>,
    private dataSource: DataSource
  ) {}

  async scanAndAdd(
    docId: string,
    loggedInUser: JwtPayload
  ): Promise<{
    success: boolean;
    message: string;
    docId: string;
    statusCode: number;
  }> {
    //TODO: Make ERP call and store retrieved doc details and status from ERP.
    let erpMatchFound = false;
    let docFromErp = null;

    // Check if document already exists in database
    const existingDoc = await this.docRepository.findOne({
      where: { id: docId },
    });
    if (existingDoc) {
      if (docFromErp) {
        //TODO: If existing doc and existing doc status does not equals delivered, and ERP status is delivered,then return a custom error message.
        //No need to flip our DB.
      }

      // Update document for all cases that allow scanning
      if (
        existingDoc.status !== DocStatus.DELIVERED &&
        existingDoc.status !== DocStatus.TRIP_SCHEDULED &&
        existingDoc.status !== DocStatus.ON_TRIP
      ) {
        existingDoc.lastScannedBy = loggedInUser.id;
        existingDoc.lastUpdatedAt = new Date();
        await this.docRepository.save(existingDoc);
      }

      // Handle different document statuses
      switch (existingDoc.status) {
        case DocStatus.DELIVERED:
          return {
            success: false,
            message: "Doc ID is already delivered and cannot be scanned again",
            docId: docId,
            statusCode: 400, // Bad Request
          };

        case DocStatus.TRIP_SCHEDULED:
          return {
            success: false,
            message: "Doc ID is already scheduled for a trip",
            docId: docId,
            statusCode: 409, // Conflict
          };

        case DocStatus.ON_TRIP:
          return {
            success: false,
            message: "Doc ID is already out on a trip",
            docId: docId,
            statusCode: 409, // Conflict
          };

        case DocStatus.READY_FOR_DISPATCH:
          return {
            success: true,
            message: "Doc ID re-scanned. Was already in route queue",
            docId: docId,
            statusCode: 409, // Conflict
          };

        case DocStatus.READY_FOR_DISPATCH_FROM_HUB:
          return {
            success: true,
            message: "Doc ID re-scanned. Was already in route queue",
            docId: docId,
            statusCode: 409, // Conflict
          };

        case DocStatus.UNDELIVERED:
          return {
            success: true,
            message:
              "Scanned and added to Route Queue (previous delivery attempt failed)",
            docId: docId,
            statusCode: 200, // OK
          };

        case DocStatus.AT_TRANSIT_HUB:
          return {
            success: true,
            message: "Scanned from transit hub and added to Route Queue",
            docId: docId,
            statusCode: 200, // OK
          };
      }
    }

    //From here on, the code below runs only if the doc is not found in the database
    let matchedDoc = null;
    if (erpMatchFound) {
      matchedDoc = docFromErp;
    } else {
      //If not found in ERP, then check in mock data
      matchedDoc = this.appService
        .getMockDocs()
        .find((doc) => doc.docId === docId);
    }

    if (!matchedDoc) {
      return {
        success: false,
        message: "Doc ID not found in ERP", //as well as mock data
        docId: docId,
        statusCode: 400, // Bad Request
      };
    }

    // Check user's previous scan within configured timeout (only for new documents)
    const timeoutMinutes = GlobalConstants.SCAN_ROUTE_TIMEOUT_MINUTES;
    const timeoutAgo = new Date(Date.now() - timeoutMinutes * 60 * 1000);
    const lastScan = await this.docRepository.findOne({
      where: {
        lastScannedBy: loggedInUser.id,
        lastUpdatedAt: MoreThan(timeoutAgo),
      },
      order: { lastUpdatedAt: "DESC" },
    });

    if (lastScan) {
      if (lastScan.route !== matchedDoc.routeId) {
        const timeDiff = Math.floor(
          (Date.now() - lastScan.lastUpdatedAt.getTime()) / (1000 * 60)
        );
        const remainingMinutes = timeoutMinutes - timeDiff;

        return {
          success: false,
          message: `Route conflict detected. Previous scan route: ${lastScan.route}. Current scan route: ${matchedDoc.routeId}. Please wait for ${remainingMinutes} minute(s) cooling off period and then reattempt scan.`,
          docId: docId,
          statusCode: 400, // Bad Request
        };
      }
    }

    // Check if customer exists, create or update it
    let customer = await this.customerRepository.findOne({
      where: { id: matchedDoc.customerId },
    });

    if (!customer) {
      // Create new customer record
      customer = this.customerRepository.create({
        id: matchedDoc.customerId,
        firmName: matchedDoc.customerName,
        address: matchedDoc.customerAddress,
        city: matchedDoc.customerCity,
        pincode: matchedDoc.customerPinCode,
        phone: matchedDoc.customerPhone,
        geoLatitude: null, // No geo data for now
        geoLongitude: null, // No geo data for now
        createdAt: new Date(),
        lastUpdatedAt: new Date(),
      });
    } else {
      // Update existing customer record with latest details
      // Do not update any geo coordinates
      customer.firmName = matchedDoc.customerName;
      customer.address = matchedDoc.customerAddress;
      customer.city = matchedDoc.customerCity;
      customer.pincode = matchedDoc.customerPinCode;
      customer.phone = matchedDoc.customerPhone;
      customer.lastUpdatedAt = new Date();
    }
    // Create new document record
    const newDoc = this.docRepository.create({
      id: matchedDoc.docId,
      status:
        existingDoc && existingDoc.status == DocStatus.AT_TRANSIT_HUB
          ? DocStatus.READY_FOR_DISPATCH_FROM_HUB
          : DocStatus.READY_FOR_DISPATCH,
      lastScannedBy: loggedInUser.id,
      originWarehouse: matchedDoc.whseLocationName,
      tripId: null, // No trip_id for now
      docDate: matchedDoc.docDate,
      docAmount: matchedDoc.docAmount,
      route: matchedDoc.routeId,
      lot: matchedDoc.lotNbr || null,
      customerId: matchedDoc.customerId,
      createdAt: new Date(),
      lastUpdatedAt: new Date(),
    });
    try {
      await this.dataSource.transaction(async (entityManager) => {
        await entityManager
          .getRepository(this.customerRepository.target)
          .save(customer);
        await entityManager
          .getRepository(this.docRepository.target)
          .save(newDoc);
      });
    } catch (error) {
      return {
        success: false,
        message: "Error adding document: " + error.message,
        docId: docId,
        statusCode: 500, // Internal Server Error
      };
    }

    return {
      success: true,
      message: "Scanned and added to Route Queue",
      docId: docId,
      statusCode: 200, // Created
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

  async createMockData(
    useOneRealPhoneNumber?: string,
    useOneRealRouteId?: string,
    useOneRealLotNbr?: string
  ) {
    const mockDocs = [];

    // Sample data arrays for random selection

    const lotNumbers = ["LOT001", "LOT002", "LOT003", ""];
    const warehouseLocations = ["WH-Vytilla", "WH-Thodupuzha"];

    const customers = GlobalConstants.CUSTOMERS;

    // Generate 10 mock documents with 50% having blank status
    for (let i = 0; i < 10; i++) {
      let selectedCustomer;

      // If real phone number is provided, use first customer (ABC Pharmaceuticals) for first document
      if (i === 0 && useOneRealPhoneNumber) {
        selectedCustomer = { ...customers[0] }; // ABC Pharmaceuticals (MOCKCUST001) - create a copy
        // Override routeId and lotNbr if provided
        if (useOneRealRouteId) {
          selectedCustomer.route = useOneRealRouteId;
        }
        if (useOneRealLotNbr) {
          // We'll handle lotNbr in the mockDoc creation since it's not part of customer data
        }
      } else {
        // For all other documents, select random customer
        selectedCustomer =
          customers[Math.floor(Math.random() * customers.length)];
      }
      // Use real phone number for first document if provided, otherwise use customer's phone
      const phoneNumber =
        i === 0 && useOneRealPhoneNumber
          ? useOneRealPhoneNumber
          : selectedCustomer.phone;

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
        routeId: selectedCustomer.route,
        lotNbr:
          i === 0 && useOneRealPhoneNumber && useOneRealLotNbr
            ? useOneRealLotNbr
            : lotNumbers[Math.floor(Math.random() * lotNumbers.length)], // Can be blank
        whseLocationName:
          warehouseLocations[
            Math.floor(Math.random() * warehouseLocations.length)
          ],
        customerId: selectedCustomer.id,
        customerName: selectedCustomer.name,
        customerAddress: selectedCustomer.address,
        customerCity: selectedCustomer.city,
        customerPinCode: selectedCustomer.pincode,
        customerPhone: phoneNumber,
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
            .text(`Phone: ${docData.customerPhone || "Not available"}`)
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
