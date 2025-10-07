import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import * as JsBarcode from "jsbarcode";
import * as PDFDocument from "pdfkit";
import { DocStatus } from "src/enums/doc-status.enum";
import { DataSource, In, Like, MoreThan, Repository } from "typeorm";

import { GlobalConstants } from "src/GlobalConstants";
import { DispatchQueue } from "src/interfaces/dispatch-queue.interface";
import { JwtPayload } from "src/interfaces/jwt-payload.interface";
import { RouteSummary } from "src/interfaces/route-summary.interface";
import { ScannedUserSummary } from "src/interfaces/scanned-user-summary.interface";
import { Customer } from "../entities/customer.entity";
import { Doc } from "../entities/doc.entity";
import { Signature } from "../entities/signature.entity";
import { AppUser } from "../entities/app-user.entity";
import { Trip } from "../entities/trip.entity";
import { LocationHeartbeat } from "../entities/location-heartbeat.entity";
import { MarkDeliveryDto } from "../dto/mark-delivery.dto";
import { MarkDeliveryFailedDto } from "../dto/mark-delivery-failed.dto";
import { DocTrackingResponseDto } from "../dto/doc-tracking-response.dto";
import { MockDataService } from "./mock-data.service";
import { SettingsCacheService } from "./settings-cache.service";

@Injectable()
export class DocService {
  constructor(
    private readonly mockDataService: MockDataService,
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    @InjectRepository(Doc)
    private readonly docRepository: Repository<Doc>,
    @InjectRepository(Signature)
    private readonly signatureRepository: Repository<Signature>,
    @InjectRepository(AppUser)
    private readonly appUserRepository: Repository<AppUser>,
    @InjectRepository(Trip)
    private readonly tripRepository: Repository<Trip>,
    @InjectRepository(LocationHeartbeat)
    private readonly locationHeartbeatRepository: Repository<LocationHeartbeat>,
    private readonly settingsCacheService: SettingsCacheService,
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
        //Flip our DB too.
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
            message: "Doc ID re-scanned. Was already in dispatch queue",
            docId: docId,
            statusCode: 409, // Conflict
          };

        case DocStatus.UNDELIVERED:
          return {
            success: true,
            message:
              "Scanned and added to Dispatch Queue (previous delivery attempt failed)",
            docId: docId,
            statusCode: 200, // OK
          };

        case DocStatus.AT_TRANSIT_HUB:
          return {
            success: true,
            message: "Scanned from transit hub and added to Dispatch Queue",
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
      matchedDoc = this.mockDataService
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
    // Get cooling off period from cache
    const timeoutSeconds =
      this.settingsCacheService.getCoolOffSecondsBetweenDiffRouteScans();

    const timeoutAgo = new Date(Date.now() - timeoutSeconds * 1000);
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
          (Date.now() - lastScan.lastUpdatedAt.getTime()) / 1000
        );
        const remainingSeconds = timeoutSeconds - timeDiff;

        return {
          success: false,
          message: `Route conflict detected. Previous scan route: ${lastScan.route}. Current scan route: ${matchedDoc.routeId}. Please wait for ${remainingSeconds} second(s) cooling off period and then reattempt scan.`,
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
      status: DocStatus.READY_FOR_DISPATCH,
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
      message: "Scanned and added to Dispatch Queue",
      docId: docId,
      statusCode: 200, // Created
    };
  }

  async getDispatchQueueForUser(loggedInUser: JwtPayload) {
    // Find all users with the same base location
    const usersInSameLocation = await this.appUserRepository.find({
      where: { baseLocationId: loggedInUser.baseLocationId },
      select: {
        id: true,
        personName: true,
      },
    });

    const userIds = usersInSameLocation.map((user) => user.id);

    // Create a map of user ID to user name for quick lookup
    const userIdToNameMap = {};
    usersInSameLocation.forEach((user) => {
      userIdToNameMap[user.id] = user.personName;
    });

    // Get all documents in READY_FOR_DISPATCH status
    // created by users in the same base location
    const dispatchQueueDocs = await this.docRepository.find({
      where: [
        {
          status: DocStatus.READY_FOR_DISPATCH,
          lastScannedBy: In(userIds),
        },
      ],
      order: { createdAt: "DESC" },
    });

    // Group documents by route and then by lastScannedBy
    const routeMap = new Map<string, Map<string, ScannedUserSummary>>();

    for (const doc of dispatchQueueDocs) {
      const route = doc.route;
      const scannedByUserId = doc.lastScannedBy;
      const scannedByName = userIdToNameMap[scannedByUserId];

      if (!routeMap.has(route)) {
        routeMap.set(route, new Map());
      }

      const userMap = routeMap.get(route);
      if (!userMap.has(scannedByName)) {
        const userSummary: ScannedUserSummary = {
          scannedByUserId: scannedByUserId,
          scannedByName: scannedByName,
          scannedFromLocation: loggedInUser.baseLocationName,
          count: 0,
        };
        userMap.set(scannedByName, userSummary);
      }

      userMap.get(scannedByName).count++;
    }

    // Convert Map structure to DispatchQueueList format
    const routeSummaryList: RouteSummary[] = [];
    for (const [route, userMap] of routeMap) {
      const userSummaryList: ScannedUserSummary[] = Array.from(
        userMap.values()
      );
      routeSummaryList.push({
        route: route,
        userSummaryList: userSummaryList,
      });
    }

    // Sort routeSummaryList by route (alphabetically ascending)
    routeSummaryList.sort((a, b) => a.route.localeCompare(b.route));

    // Sort userSummaryList by scannedByUserId (ascending) for each route
    routeSummaryList.forEach((routeSummary) => {
      routeSummary.userSummaryList.sort((a, b) =>
        a.scannedByUserId.localeCompare(b.scannedByUserId)
      );
    });

    const dispatchQueueList: DispatchQueue = {
      routeSummaryList: routeSummaryList,
    };

    return {
      success: true,
      message: `Found ${dispatchQueueDocs.length} documents in dispatch queue for your base location`,
      dispatchQueueList: dispatchQueueList,
      totalDocs: dispatchQueueDocs.length,
      statusCode: 200,
    };
  }

  async undoAllScans(loggedInUser: JwtPayload): Promise<{
    success: boolean;
    message: string;
    deletedDocs: number;
    statusCode: number;
  }> {
    //TODO: For ones at transit hub, deleting the doc will make us lose all historical refs. This needs to be handled.
    return await this.dataSource
      .transaction(async (manager) => {
        try {
          // Find all documents scanned by the logged-in user in READY_FOR_DISPATCH status
          const docsToProcess = await manager.find(Doc, {
            where: [
              {
                lastScannedBy: loggedInUser.id,
                status: DocStatus.READY_FOR_DISPATCH,
              },
            ],
          });

          if (docsToProcess.length === 0) {
            return {
              success: true,
              message: "No documents found to undo",
              deletedDocs: 0,
              statusCode: 200,
            };
          }

          let deletedDocs = 0;

          // Separate documents by action type

          const docsToDelete: Doc[] = [];

          for (const doc of docsToProcess) {
            // Delete the document
            docsToDelete.push(doc);
          }

          // Batch delete documents
          if (docsToDelete.length > 0) {
            await manager.remove(Doc, docsToDelete);
            deletedDocs = docsToDelete.length;
          }

          return {
            success: true,
            message: `Successfully unscanned ${deletedDocs} documents`,
            deletedDocs: deletedDocs,
            statusCode: 200,
          };
        } catch (error) {
          console.error("Error in undoAllScans transaction:", error);
          throw error; // Re-throw to trigger transaction rollback
        }
      })
      .catch((error) => {
        console.error("Transaction failed in undoAllScans:", error);
        return {
          success: false,
          message: "Failed to undo scans",
          deletedDocs: 0,
          statusCode: 500,
        };
      });
  }

  async purgeMockData(): Promise<{
    deletedDocs: number;
    deletedCustomers: number;
  }> {
    const mockPrefix = `${GlobalConstants.MOCK_CUSTOMER_PREFIX}%`;

    // First, find and delete all docs where customerId starts with the mock prefix
    const docsToDelete = await this.docRepository.find({
      where: {
        customerId: Like(mockPrefix),
      },
    });
    const deletedDocsResult = await this.docRepository.remove(docsToDelete);

    // Then, find and delete all customers with the mock prefix
    const customersToDelete = await this.customerRepository.find({
      where: {
        id: Like(mockPrefix),
      },
    });
    const deletedCustomersResult = await this.customerRepository.remove(
      customersToDelete
    );

    // Clear mock data from MockDataService after successful database cleanup
    this.mockDataService.clearMockDocs();

    return {
      deletedDocs: deletedDocsResult.length,
      deletedCustomers: deletedCustomersResult.length,
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
    for (let i = 0; i < GlobalConstants.NUM_BARCODES_IN_PDF; i++) {
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
    this.mockDataService.addMockDocs(mockDocs);

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

        // Add documents in a 2x2 grid (4 per page)
        const docsPerPage = 4;
        const totalPages = Math.ceil(mockDocs.length / docsPerPage);

        for (let page = 0; page < totalPages; page++) {
          if (page > 0) {
            doc.addPage();
          }

          const startIndex = page * docsPerPage;
          const endIndex = Math.min(startIndex + docsPerPage, mockDocs.length);
          const pageDocs = mockDocs.slice(startIndex, endIndex);

          // Calculate grid positions
          const pageWidth = doc.page.width - 100; // Account for margins
          const pageHeight = doc.page.height - 100;
          const cellWidth = pageWidth / 2;
          const cellHeight = pageHeight / 2;

          pageDocs.forEach((docData, gridIndex) => {
            const row = Math.floor(gridIndex / 2);
            const col = gridIndex % 2;

            const x = 50 + col * cellWidth;
            const y = 50 + row * cellHeight;

            // Save current position
            doc.save();

            // Move to grid position
            doc.x = x;
            doc.y = y;

            // Add document info
            doc
              .fontSize(10)
              .text(`Doc ${startIndex + gridIndex + 1}:`, { underline: true })
              .moveDown(0.3);

            // Make DOC ID more prominent
            doc
              .fontSize(12)
              .text(`DOC ID: ${docData.docId}`, { bold: true })
              .moveDown(0.2);

            // Other document details in smaller font
            doc
              .fontSize(8)
              .text(`Customer: ${docData.customerName}`)
              .text(`Phone: ${docData.customerPhone || "N/A"}`)
              .text(`Route: ${docData.routeId}`)
              .text(`Lot: ${docData.lotNbr || "N/A"}`)
              .text(`Date: ${docData.docDate.toLocaleDateString()}`)
              .text(`Amount: Rs. ${docData.docAmount}`)
              .text(`Status: ${docData.status || "Blank"}`)
              .moveDown(0.3);

            // Generate barcode
            const canvas = require("canvas").createCanvas(150, 40);
            JsBarcode(canvas, docData.docId, {
              format: "CODE128",
              width: 1.5,
              height: 30,
              displayValue: true,
              fontSize: 10,
              margin: 5,
            });

            // Add barcode to PDF
            const barcodeImage = canvas.toBuffer("image/png");
            doc.image(barcodeImage, { width: 150, height: 40 });

            // Restore position
            doc.restore();
          });
        }

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  async markDelivery(
    docId: string,
    markDeliveryDto: MarkDeliveryDto
  ): Promise<{
    success: boolean;
    message: string;
    docId: string;
    statusCode: number;
  }> {
    // Check if document exists
    const existingDoc = await this.docRepository.findOne({
      where: { id: docId },
    });

    if (!existingDoc) {
      throw new NotFoundException(
        "Document was not scanned and so not in the system yet"
      );
    }

    // Validate that signature is provided for successful delivery
    if (!markDeliveryDto.signature) {
      throw new BadRequestException(
        "Signature is required for successful delivery"
      );
    }

    // Use transaction for data consistency
    return await this.dataSource.transaction(async (manager) => {
      // Mark as delivered
      await manager.update(Doc, docId, {
        status: DocStatus.DELIVERED,
        lastUpdatedAt: new Date(),
        ...(markDeliveryDto.deliveryComment && {
          comment: markDeliveryDto.deliveryComment,
        }),
      });

      // Save signature
      const signatureBuffer = Buffer.from(markDeliveryDto.signature, "base64");

      // Check if signature already exists
      const existingSignature = await manager.findOne(Signature, {
        where: { docId },
      });

      if (existingSignature) {
        // Update existing signature
        await manager.update(Signature, docId, {
          signature: signatureBuffer,
          lastUpdatedAt: new Date(),
        });
      } else {
        // Create new signature
        const newSignature = manager.create(Signature, {
          docId,
          signature: signatureBuffer,
          lastUpdatedAt: new Date(),
        });
        await manager.save(Signature, newSignature);
      }

      // Update customer coordinates if provided
      if (
        markDeliveryDto.deliveryLatitude &&
        markDeliveryDto.deliveryLongitude
      ) {
        await manager.update(Customer, existingDoc.customerId, {
          geoLatitude: markDeliveryDto.deliveryLatitude.toString(),
          geoLongitude: markDeliveryDto.deliveryLongitude.toString(),
          lastUpdatedAt: new Date(),
        });
      }

      return {
        success: true,
        message: "Document marked as delivered successfully",
        docId: docId,
        statusCode: 200,
      };
    });
  }

  async markDeliveryFailed(
    docId: string,
    markDeliveryFailedDto: MarkDeliveryFailedDto
  ): Promise<{
    success: boolean;
    message: string;
    docId: string;
    statusCode: number;
  }> {
    // Check if document exists
    const existingDoc = await this.docRepository.findOne({
      where: { id: docId },
    });

    if (!existingDoc) {
      throw new NotFoundException(
        "Document was not scanned and so not in the system yet"
      );
    }

    // Mark as undelivered with failure comment
    await this.docRepository.update(docId, {
      status: DocStatus.UNDELIVERED,
      lastUpdatedAt: new Date(),
      comment: markDeliveryFailedDto.failureComment,
    });

    return {
      success: true,
      message: "Document marked as delivery failed successfully",
      docId: docId,
      statusCode: 200,
    };
  }

  async trackDocument(token: string): Promise<DocTrackingResponseDto> {
    // Decode the base64 token to get docId
    let docId: string;
    try {
      docId = Buffer.from(token, "base64").toString("utf-8");
    } catch (error) {
      throw new BadRequestException("Invalid token");
    }

    // Find the document
    const doc = await this.docRepository.findOne({
      where: { id: docId },
      relations: ["customer"],
    });

    if (!doc) {
      throw new BadRequestException("Invalid token");
    }

    const response: DocTrackingResponseDto = {
      success: true,
      message: "Document tracking information retrieved successfully",
      status: doc.status,
    };

    // Handle different statuses
    switch (doc.status) {
      case DocStatus.READY_FOR_DISPATCH:
      case DocStatus.TRIP_SCHEDULED:
        // Just return the status
        break;

      case DocStatus.DELIVERED:
        // Return status, comment, and delivery timestamp from signature
        response.comment = doc.comment;

        const signature = await this.signatureRepository.findOne({
          where: { docId: docId },
        });

        if (signature) {
          response.deliveryTimestamp = signature.lastUpdatedAt;
        }
        break;

      case DocStatus.UNDELIVERED:
        // Return status and comment
        response.comment = doc.comment;
        break;

      case DocStatus.ON_TRIP:
      case DocStatus.AT_TRANSIT_HUB:
        // Get trip information
        const trip = await this.tripRepository.findOne({
          where: { id: doc.tripId },
        });

        if (trip) {
          // Check if trip started within last 48 hours
          const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);

          if (trip.createdAt >= fortyEightHoursAgo) {
            // Add customer location if available
            if (
              doc.customer &&
              doc.customer.geoLatitude &&
              doc.customer.geoLongitude
            ) {
              response.customerLocation = {
                latitude: doc.customer.geoLatitude,
                longitude: doc.customer.geoLongitude,
              };
            }

            // Get driver's last known location in the last 48 hours
            const driverLocation =
              await this.locationHeartbeatRepository.findOne({
                where: {
                  appUserId: trip.drivenBy,
                  receivedAt: MoreThan(fortyEightHoursAgo),
                },
                order: {
                  receivedAt: "DESC",
                },
              });

            if (driverLocation) {
              response.driverLastKnownLocation = {
                latitude: driverLocation.geoLatitude,
                longitude: driverLocation.geoLongitude,
                receivedAt: driverLocation.receivedAt,
              };
            }
          }
        }
        break;

      default:
        // Unknown status, just return the status
        break;
    }

    return response;
  }
}
