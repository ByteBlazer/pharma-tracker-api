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
    const statuses = [
      "",
      "READY_FOR_DISPATCH",
      "TRIP_SCHEDULED",
      "ON_TRIP",
      "AT_TRANSIT_HUB",
      "DELIVERED",
      "UNDELIVERED",
    ];
    const lotNumbers = ["LOT001", "LOT002", "LOT003", ""];
    const warehouseLocations = ["WH-Vytilla", "WH-Thodupuzha"];

    // Customer data with cities, pincodes, and routes (50 customers)
    const customers = [
      // Route 1 - Ernakulam
      {
        id: `${GlobalConstants.MOCK_CUSTOMER_PREFIX}001`,
        name: "ABC Pharmaceuticals",
        address: "123 Business Park",
        city: "Ernakulam",
        pincode: "682001",
        route: "Route 1",
      },
      {
        id: `${GlobalConstants.MOCK_CUSTOMER_PREFIX}002`,
        name: "Ernakulam Medical Center",
        address: "456 MG Road",
        city: "Ernakulam",
        pincode: "682001",
        route: "Route 1",
      },
      {
        id: `${GlobalConstants.MOCK_CUSTOMER_PREFIX}003`,
        name: "Kochi Pharma Ltd",
        address: "789 Marine Drive",
        city: "Ernakulam",
        pincode: "682001",
        route: "Route 1",
      },
      {
        id: `${GlobalConstants.MOCK_CUSTOMER_PREFIX}004`,
        name: "Fort Kochi Hospital",
        address: "321 Fort Area",
        city: "Ernakulam",
        pincode: "682001",
        route: "Route 1",
      },
      {
        id: `${GlobalConstants.MOCK_CUSTOMER_PREFIX}005`,
        name: "Jubilee Medical Store",
        address: "654 Broadway",
        city: "Ernakulam",
        pincode: "682001",
        route: "Route 1",
      },
      {
        id: `${GlobalConstants.MOCK_CUSTOMER_PREFIX}006`,
        name: "Lulu Pharmacy",
        address: "987 Edappally",
        city: "Ernakulam",
        pincode: "682001",
        route: "Route 1",
      },
      {
        id: `${GlobalConstants.MOCK_CUSTOMER_PREFIX}007`,
        name: "Kakkanad Health Center",
        address: "147 Infopark",
        city: "Ernakulam",
        pincode: "682001",
        route: "Route 1",
      },
      {
        id: `${GlobalConstants.MOCK_CUSTOMER_PREFIX}008`,
        name: "Vytilla Medical Hub",
        address: "258 Vytilla",
        city: "Ernakulam",
        pincode: "682001",
        route: "Route 1",
      },
      {
        id: `${GlobalConstants.MOCK_CUSTOMER_PREFIX}009`,
        name: "Aluva General Hospital",
        address: "369 Aluva",
        city: "Ernakulam",
        pincode: "682001",
        route: "Route 1",
      },
      {
        id: `${GlobalConstants.MOCK_CUSTOMER_PREFIX}010`,
        name: "Perumbavoor Clinic",
        address: "741 Perumbavoor",
        city: "Ernakulam",
        pincode: "682001",
        route: "Route 1",
      },

      // Route 2 - Kodakara & Thrissur
      {
        id: `${GlobalConstants.MOCK_CUSTOMER_PREFIX}011`,
        name: "XYZ Medical Center",
        address: "456 Health Street",
        city: "Kodakara",
        pincode: "680684",
        route: "Route 2",
      },
      {
        id: `${GlobalConstants.MOCK_CUSTOMER_PREFIX}012`,
        name: "Kodakara Pharmacy",
        address: "123 Main Road",
        city: "Kodakara",
        pincode: "680684",
        route: "Route 2",
      },
      {
        id: `${GlobalConstants.MOCK_CUSTOMER_PREFIX}013`,
        name: "MediCorp Ltd",
        address: "789 Medical Avenue",
        city: "Thrissur",
        pincode: "680001",
        route: "Route 2",
      },
      {
        id: `${GlobalConstants.MOCK_CUSTOMER_PREFIX}014`,
        name: "Thrissur Medical College",
        address: "321 College Road",
        city: "Thrissur",
        pincode: "680001",
        route: "Route 2",
      },
      {
        id: `${GlobalConstants.MOCK_CUSTOMER_PREFIX}015`,
        name: "Guruvayur Hospital",
        address: "654 Temple Road",
        city: "Thrissur",
        pincode: "680001",
        route: "Route 2",
      },
      {
        id: `${GlobalConstants.MOCK_CUSTOMER_PREFIX}016`,
        name: "Chalakudy Medical Center",
        address: "987 NH47",
        city: "Thrissur",
        pincode: "680001",
        route: "Route 2",
      },
      {
        id: `${GlobalConstants.MOCK_CUSTOMER_PREFIX}017`,
        name: "Irinjalakuda Clinic",
        address: "147 Railway Station",
        city: "Thrissur",
        pincode: "680001",
        route: "Route 2",
      },
      {
        id: `${GlobalConstants.MOCK_CUSTOMER_PREFIX}018`,
        name: "Wadakkanchery Pharmacy",
        address: "258 Market Road",
        city: "Thrissur",
        pincode: "680001",
        route: "Route 2",
      },
      {
        id: `${GlobalConstants.MOCK_CUSTOMER_PREFIX}019`,
        name: "Kodungallur Medical Store",
        address: "369 Beach Road",
        city: "Thrissur",
        pincode: "680001",
        route: "Route 2",
      },
      {
        id: `${GlobalConstants.MOCK_CUSTOMER_PREFIX}020`,
        name: "Kunnamkulam Health Center",
        address: "741 Bus Stand",
        city: "Thrissur",
        pincode: "680001",
        route: "Route 2",
      },

      // Route 3 - Alleppey & Cherthala
      {
        id: `${GlobalConstants.MOCK_CUSTOMER_PREFIX}021`,
        name: "HealthPlus Inc",
        address: "321 Wellness Road",
        city: "Alleppey",
        pincode: "688001",
        route: "Route 3",
      },
      {
        id: `${GlobalConstants.MOCK_CUSTOMER_PREFIX}022`,
        name: "Alleppey Medical Center",
        address: "456 Beach Road",
        city: "Alleppey",
        pincode: "688001",
        route: "Route 3",
      },
      {
        id: `${GlobalConstants.MOCK_CUSTOMER_PREFIX}023`,
        name: "Backwater Hospital",
        address: "789 Canal Road",
        city: "Alleppey",
        pincode: "688001",
        route: "Route 3",
      },
      {
        id: `${GlobalConstants.MOCK_CUSTOMER_PREFIX}024`,
        name: "Alappuzha General",
        address: "123 Market Road",
        city: "Alleppey",
        pincode: "688001",
        route: "Route 3",
      },
      {
        id: `${GlobalConstants.MOCK_CUSTOMER_PREFIX}025`,
        name: "Pharma Solutions",
        address: "654 Medicine Lane",
        city: "Cherthala",
        pincode: "688524",
        route: "Route 3",
      },
      {
        id: `${GlobalConstants.MOCK_CUSTOMER_PREFIX}026`,
        name: "Cherthala Medical Store",
        address: "987 Main Street",
        city: "Cherthala",
        pincode: "688524",
        route: "Route 3",
      },
      {
        id: `${GlobalConstants.MOCK_CUSTOMER_PREFIX}027`,
        name: "Kayamkulam Hospital",
        address: "147 Railway Road",
        city: "Alleppey",
        pincode: "688001",
        route: "Route 3",
      },
      {
        id: `${GlobalConstants.MOCK_CUSTOMER_PREFIX}028`,
        name: "Haripad Clinic",
        address: "258 Temple Road",
        city: "Alleppey",
        pincode: "688001",
        route: "Route 3",
      },
      {
        id: `${GlobalConstants.MOCK_CUSTOMER_PREFIX}029`,
        name: "Mavelikkara Pharmacy",
        address: "369 Market Street",
        city: "Alleppey",
        pincode: "688001",
        route: "Route 3",
      },
      {
        id: `${GlobalConstants.MOCK_CUSTOMER_PREFIX}030`,
        name: "Chengannur Medical Center",
        address: "741 Bus Stand Road",
        city: "Alleppey",
        pincode: "688001",
        route: "Route 3",
      },

      // Route 4 - Vaikom & Kottayam
      {
        id: `${GlobalConstants.MOCK_CUSTOMER_PREFIX}031`,
        name: "Care Hospital",
        address: "987 Treatment Blvd",
        city: "Vaikom",
        pincode: "686141",
        route: "Route 4",
      },
      {
        id: `${GlobalConstants.MOCK_CUSTOMER_PREFIX}032`,
        name: "Vaikom Medical Store",
        address: "123 Temple Road",
        city: "Vaikom",
        pincode: "686141",
        route: "Route 4",
      },
      {
        id: `${GlobalConstants.MOCK_CUSTOMER_PREFIX}033`,
        name: "Life Sciences Co",
        address: "147 Research Drive",
        city: "Kottayam",
        pincode: "686001",
        route: "Route 4",
      },
      {
        id: `${GlobalConstants.MOCK_CUSTOMER_PREFIX}034`,
        name: "Kottayam Medical College",
        address: "456 College Road",
        city: "Kottayam",
        pincode: "686001",
        route: "Route 4",
      },
      {
        id: `${GlobalConstants.MOCK_CUSTOMER_PREFIX}035`,
        name: "Changanassery Hospital",
        address: "789 Main Road",
        city: "Kottayam",
        pincode: "686001",
        route: "Route 4",
      },
      {
        id: `${GlobalConstants.MOCK_CUSTOMER_PREFIX}036`,
        name: "Pala Medical Center",
        address: "321 Market Street",
        city: "Kottayam",
        pincode: "686001",
        route: "Route 4",
      },
      {
        id: `${GlobalConstants.MOCK_CUSTOMER_PREFIX}037`,
        name: "Kanjirapally Clinic",
        address: "654 Railway Road",
        city: "Kottayam",
        pincode: "686001",
        route: "Route 4",
      },
      {
        id: `${GlobalConstants.MOCK_CUSTOMER_PREFIX}038`,
        name: "Erattupetta Pharmacy",
        address: "987 Bus Stand",
        city: "Kottayam",
        pincode: "686001",
        route: "Route 4",
      },
      {
        id: `${GlobalConstants.MOCK_CUSTOMER_PREFIX}039`,
        name: "Mundakayam Health Center",
        address: "147 Hill Station Road",
        city: "Kottayam",
        pincode: "686001",
        route: "Route 4",
      },
      {
        id: `${GlobalConstants.MOCK_CUSTOMER_PREFIX}040`,
        name: "Kumarakom Medical Store",
        address: "258 Backwater Road",
        city: "Kottayam",
        pincode: "686001",
        route: "Route 4",
      },

      // Route 5 - Idukki
      {
        id: `${GlobalConstants.MOCK_CUSTOMER_PREFIX}041`,
        name: "BioMed Corp",
        address: "258 Science Street",
        city: "Idukki",
        pincode: "685602",
        route: "Route 5",
      },
      {
        id: `${GlobalConstants.MOCK_CUSTOMER_PREFIX}042`,
        name: "Idukki Medical Center",
        address: "123 Hill Station",
        city: "Idukki",
        pincode: "685602",
        route: "Route 5",
      },
      {
        id: `${GlobalConstants.MOCK_CUSTOMER_PREFIX}043`,
        name: "Munnar Hospital",
        address: "456 Tea Garden Road",
        city: "Idukki",
        pincode: "685602",
        route: "Route 5",
      },
      {
        id: `${GlobalConstants.MOCK_CUSTOMER_PREFIX}044`,
        name: "Thekkady Clinic",
        address: "789 Wildlife Road",
        city: "Idukki",
        pincode: "685602",
        route: "Route 5",
      },
      {
        id: `${GlobalConstants.MOCK_CUSTOMER_PREFIX}045`,
        name: "Kumily Medical Store",
        address: "321 Spice Market",
        city: "Idukki",
        pincode: "685602",
        route: "Route 5",
      },
      {
        id: `${GlobalConstants.MOCK_CUSTOMER_PREFIX}046`,
        name: "Vandiperiyar Pharmacy",
        address: "654 Plantation Road",
        city: "Idukki",
        pincode: "685602",
        route: "Route 5",
      },
      {
        id: `${GlobalConstants.MOCK_CUSTOMER_PREFIX}047`,
        name: "Peermade Health Center",
        address: "987 Hill Road",
        city: "Idukki",
        pincode: "685602",
        route: "Route 5",
      },
      {
        id: `${GlobalConstants.MOCK_CUSTOMER_PREFIX}048`,
        name: "Adimali Medical Store",
        address: "147 Valley Road",
        city: "Idukki",
        pincode: "685602",
        route: "Route 5",
      },
      {
        id: `${GlobalConstants.MOCK_CUSTOMER_PREFIX}049`,
        name: "Nedumkandam Clinic",
        address: "369 Forest Road",
        city: "Idukki",
        pincode: "685602",
        route: "Route 5",
      },
      {
        id: `${GlobalConstants.MOCK_CUSTOMER_PREFIX}050`,
        name: "Thodupuzha Medical Center",
        address: "741 Main Road",
        city: "Idukki",
        pincode: "685602",
        route: "Route 5",
      },
    ];

    // Generate 10 mock documents with 50% having blank status
    for (let i = 0; i < 10; i++) {
      const randomCustomer =
        customers[Math.floor(Math.random() * customers.length)];

      // 50% of documents (first 5) get blank status, rest get random status
      let status;
      if (i < 5) {
        status = ""; // Blank status for first 5 documents
      } else {
        // For remaining 5 documents, get random status (excluding blank)
        const nonBlankStatuses = statuses.filter((s) => s !== "");
        status =
          nonBlankStatuses[Math.floor(Math.random() * nonBlankStatuses.length)];
      }

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
        status: status,
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
