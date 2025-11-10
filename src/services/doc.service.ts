import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import * as JsBarcode from "jsbarcode";
import * as PDFDocument from "pdfkit";
import { DocStatus } from "src/enums/doc-status.enum";
import { TripStatus } from "src/enums/trip-status.enum";
import {
  DataSource,
  In,
  Like,
  MoreThan,
  MoreThanOrEqual,
  Not,
  Repository,
} from "typeorm";
import axios from "axios";

import { GlobalConstants } from "src/GlobalConstants";
import {
  getErpBaseUrl,
  getErpApiHeaders,
  getErpApiStatusUpdateHookUrl,
} from "../utils/erp-api.utils";
import { DispatchQueue } from "src/interfaces/dispatch-queue.interface";
import { JwtPayload } from "src/interfaces/jwt-payload.interface";
import { RouteSummary } from "src/interfaces/route-summary.interface";
import { ScannedUserSummary } from "src/interfaces/scanned-user-summary.interface";
import { Customer } from "../entities/customer.entity";
import { Doc } from "../entities/doc.entity";
import { DocTrackingAccess } from "../entities/doc-tracking-access.entity";
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
    @InjectRepository(DocTrackingAccess)
    private readonly docTrackingAccessRepository: Repository<DocTrackingAccess>,
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

  async getDocumentStatus(docId: string): Promise<DocStatus> {
    const doc = await this.docRepository.findOne({
      where: { id: docId },
    });

    if (!doc) {
      return undefined;
    }

    return doc.status as DocStatus;
  }

  async getDocumentsByTripId(tripId: number): Promise<Doc[]> {
    return await this.docRepository.find({
      where: { tripId: tripId },
    });
  }

  async getDeliveryInfo(docId: string): Promise<{
    latitude?: string;
    longitude?: string;
    deliveredAt?: string;
    comment: string;
  } | null> {
    // Get document with customer information
    const doc = await this.docRepository.findOne({
      where: { id: docId },
      relations: {
        customer: true,
      },
    });

    if (!doc) {
      return null;
    }

    if (doc.status === DocStatus.UNDELIVERED) {
      return {
        comment: doc.comment || "",
      };
    }

    // Get signature for delivery timestamp for DELIVERED documents
    const signature = await this.signatureRepository.findOne({
      where: { docId: docId },
    });

    if (!signature) {
      return null;
    }

    return {
      latitude: doc.customer.geoLatitude || "",
      longitude: doc.customer.geoLongitude || "",
      deliveredAt: signature.lastUpdatedAt.toISOString(),
      comment: doc.comment || "",
    };
  }

  async scanAndAdd(
    docId: string,
    loggedInUser: JwtPayload,
    unscan: boolean
  ): Promise<{
    success: boolean;
    message: string;
    docId: string;
    statusCode: number;
  }> {
    //TODO: Make ERP call and store retrieved doc details and status from ERP.
    let erpMatchFound = false;
    let docFromErp = null;

    // Fetch document details from ERP
    try {
      const response = await axios.get(`${getErpBaseUrl()}/document`, {
        params: {
          doc_id: docId,
          user: loggedInUser.username,
        },
        headers: getErpApiHeaders(),
        timeout: 5000, // 5 second timeout
      });

      if (response.data) {
        docFromErp = {
          docId: docId,
          status: response.data.status,
          routeId: response.data.routeName,
          lotNbr: response.data.lotNbr,
          whseLocationName: response.data.whseLocationName,
          customerId: response.data.customerId,
          customerName: response.data.customerName,
          customerAddress: response.data.customerAddress,
          customerCity: response.data.customerCity,
          customerPhone: response.data.customerPhone,
          customerPinCode: response.data.customerPinCode,
          invoiceDate: response.data.invoiceDate,
          invoiceAmount: response.data.invoiceAmount,
          docDate: response.data.invoiceDate,
          docAmount: response.data.invoiceAmount,
        };
        erpMatchFound = true;
      }
    } catch (error: any) {
      console.error("Error fetching document from ERP API");

      if (
        error.code === "ECONNABORTED" || // Axios timeout error
        (error.message && error.message.includes("timeout"))
      ) {
        return {
          success: false,
          message:
            "ERP API Server is not responding. Please check with ERP Team.",
          docId: docId,
          statusCode: 400,
        };
      }

      if (error.response && error.response.status === 400) {
        return {
          success: false,
          message: `Doc ID ${docId} not found in ERP. Please check with ERP Team.`,
          docId: docId,
          statusCode: 400,
        };
      }

      // Fallback for other errors
      return {
        success: false,
        message: "Unkown error from ERP API. Please check with ERP Team.",
        docId: docId,
        statusCode: 400,
      };
    }
    if (unscan) {
      // Check if document exists in database
      const existingDoc = await this.docRepository.findOne({
        where: { id: docId },
      });
      if (
        !existingDoc ||
        existingDoc.status == DocStatus.UNDELIVERED ||
        existingDoc.status == DocStatus.DELIVERED
      ) {
        return {
          success: false,
          message: "Doc ID " + docId + " not found in queue.",
          docId: docId,
          statusCode: 400,
        };
      }

      if (existingDoc.status == DocStatus.TRIP_SCHEDULED) {
        return {
          success: false,
          message:
            "Doc ID " +
            docId +
            " is already scheduled for Trip #" +
            existingDoc.tripId +
            ". Try cancelling the trip first and then reattempt to remove from queue.",
          docId: docId,
          statusCode: 400,
        };
      }
      if (existingDoc.status == DocStatus.ON_TRIP) {
        return {
          success: false,
          message:
            "Doc ID " +
            docId +
            " is already out on Trip #" +
            existingDoc.tripId +
            " and cannot be removed from queue.",
          docId: docId,
          statusCode: 400,
        };
      }
      if (existingDoc.status == DocStatus.AT_TRANSIT_HUB) {
        return {
          success: false,
          message:
            "Doc ID " +
            docId +
            " is at a transit hub and cannot be removed from queue.",
          docId: docId,
          statusCode: 400,
        };
      }

      // Remove document from queue
      await this.docRepository.delete(docId);
      // Update ERP with PENDING status (non-blocking)
      if (this.settingsCacheService.getUpdateDocStatusToErp()) {
        void axios.post(
          `${getErpApiStatusUpdateHookUrl()}`,
          {
            docId: docId,
            status: DocStatus.PENDING,
            userId: loggedInUser.id,
          },
          { headers: getErpApiHeaders() }
        );
      }
      return {
        success: true,
        message: "Doc ID " + docId + " removed from queue.",
        docId: docId,
        statusCode: 200,
      };
    }

    // Check if document already exists in database
    const existingDoc = await this.docRepository.findOne({
      where: { id: docId },
    });
    if (existingDoc) {
      if (docFromErp) {
        if (existingDoc.status === DocStatus.AT_TRANSIT_HUB) {
          docFromErp.lotNbr == "";
        }

        let dbUpdateRequiredBecauseOfErpMismatch = false;
        //TODO: If existing doc and existing doc status does not equals delivered, and ERP status is delivered,then return a custom error message.
        if (docFromErp.status === DocStatus.DELIVERED) {
          if (existingDoc.status !== DocStatus.DELIVERED) {
            existingDoc.status = DocStatus.DELIVERED;
            dbUpdateRequiredBecauseOfErpMismatch = true;
          }
        }
        if (existingDoc.lot !== docFromErp.lotNbr) {
          existingDoc.lot = docFromErp.lotNbr;
          dbUpdateRequiredBecauseOfErpMismatch = true;
        }
        if (dbUpdateRequiredBecauseOfErpMismatch) {
          await this.docRepository.save(existingDoc);
        }
      }

      const previousDocStatus = existingDoc.status;

      // Update document for all cases that allow scanning
      if (
        existingDoc.status !== DocStatus.DELIVERED &&
        existingDoc.status !== DocStatus.TRIP_SCHEDULED &&
        existingDoc.status !== DocStatus.ON_TRIP
      ) {
        existingDoc.lastScannedBy = loggedInUser.id;
        existingDoc.lastUpdatedAt = new Date();
        existingDoc.comment = null;
        existingDoc.status = DocStatus.READY_FOR_DISPATCH;

        await this.docRepository.save(existingDoc);

        // Update ERP with READY_FOR_DISPATCH status for existing document re-scan (non-blocking)
        if (this.settingsCacheService.getUpdateDocStatusToErp()) {
          void axios
            .post(
              `${getErpApiStatusUpdateHookUrl()}`,
              {
                docId: docId,
                status: DocStatus.READY_FOR_DISPATCH,
                userId: loggedInUser.id,
              },
              { headers: getErpApiHeaders() }
            )
            .catch((e) => {
              console.error(
                `Failed to update doc ${docId} with status ${DocStatus.READY_FOR_DISPATCH} at ERP API`
              );
            });
        }
      }

      // Handle different document statuses
      switch (previousDocStatus) {
        case DocStatus.DELIVERED:
          return {
            success: false,
            message:
              "Doc ID " +
              docId +
              " is already delivered and cannot be scanned again for Route " +
              existingDoc.route,
            docId: docId,
            statusCode: 400, // Bad Request
          };

        case DocStatus.TRIP_SCHEDULED:
          return {
            success: false,
            message:
              "Doc ID " +
              docId +
              " is already scheduled for a trip for Route " +
              existingDoc.route,
            docId: docId,
            statusCode: 409, // Conflict
          };

        case DocStatus.ON_TRIP:
          return {
            success: false,
            message:
              "Doc ID " +
              docId +
              " is already out on a trip for Route " +
              existingDoc.route,
            docId: docId,
            statusCode: 409, // Conflict
          };

        case DocStatus.READY_FOR_DISPATCH:
          return {
            success: true,
            message:
              "Doc ID " +
              docId +
              " re-scanned. Was already in Queue for Route " +
              existingDoc.route,
            docId: docId,
            statusCode: 409, // Conflict
          };

        case DocStatus.UNDELIVERED:
          return {
            success: true,
            message:
              "Doc ID " +
              docId +
              " scanned and added to Queue for Route " +
              existingDoc.route +
              " (previous delivery attempt failed)",
            docId: docId,
            statusCode: 200, // OK
          };

        case DocStatus.AT_TRANSIT_HUB:
          return {
            success: true,
            message:
              "Doc ID " +
              docId +
              " scanned from transit hub and added to Queue for Route " +
              existingDoc.route,
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
        message: "Doc ID " + docId + " not found in ERP", //as well as mock data
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
          message: `Route conflict detected. Previous scan route: ${lastScan.route}. Current scan route: ${matchedDoc.routeId}. Please wait for ${remainingSeconds} second(s) and reattempt scan.`,
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

    // Update ERP with READY_FOR_DISPATCH status for new document (non-blocking)
    if (this.settingsCacheService.getUpdateDocStatusToErp()) {
      void axios
        .post(
          `${getErpApiStatusUpdateHookUrl()}`,
          {
            docId: docId,
            status: DocStatus.READY_FOR_DISPATCH,
            userId: loggedInUser.id,
          },
          { headers: getErpApiHeaders() }
        )
        .catch((e) => {
          console.error(
            `Failed to update doc ${docId} with status ${DocStatus.READY_FOR_DISPATCH} at ERP API:`,
            e
          );
        });
    }

    return {
      success: true,
      message:
        "Doc ID " +
        docId +
        " scanned and added to Queue for Route " +
        matchedDoc.routeId,
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
          docIdList: [],
        };
        userMap.set(scannedByName, userSummary);
      }

      userMap.get(scannedByName).count++;
      userMap.get(scannedByName).docIdList.push(doc.id);
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
    mockOfMocks: boolean,
    useOneRealPhoneNumber?: string,
    useOneRealRouteId?: string,
    useOneRealLotNbr?: string
  ) {
    const mockDocs = [];

    // Sample data arrays for random selection

    const lotNumbers = ["LOT001", "LOT002", "LOT003", ""];
    const warehouseLocations = ["WH-Vytilla", "WH-Thodupuzha"];

    let customers = GlobalConstants.CUSTOMERS;

    let docsFromErp = [];

    if (!mockOfMocks) {
      try {
        console.log(getErpBaseUrl());
        const response = await axios.get(
          `${getErpBaseUrl()}/recent-documents`,
          {
            headers: getErpApiHeaders(),
          }
        );

        // Map the API response to docsFromErp array
        if (response.data && response.data.documents) {
          docsFromErp = response.data.documents.map((doc) => ({
            docId: doc.docId,
            status: doc.status,
            routeId: doc.route_id,
            lotNbr: doc.lotNbr,
          }));
        }
      } catch (error) {
        console.error("Error fetching documents from ERP API");
        // If API call fails, use empty array as fallback
        docsFromErp = [];
      }
    }

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

      if (mockOfMocks) {
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
      } else {
        const mockDoc = {
          docId:
            docsFromErp[Math.floor(Math.random() * docsFromErp.length)].docId,
        };
        mockDocs.push(mockDoc);
      }
    }

    // Add all mock docs to app service
    this.mockDataService.addMockDocs(mockDocs);

    // Generate PDF with barcodes
    const pdfBuffer = await this.generatePdfWithBarcodes(mockDocs, mockOfMocks);

    return {
      message: "Mock data created successfully",
      count: mockDocs.length,
      docs: mockDocs,
      pdfBuffer: pdfBuffer,
    };
  }

  private async generatePdfWithBarcodes(
    mockDocs: any[],
    mockOfMocks: boolean
  ): Promise<Buffer> {
    return new Promise(async (resolve, reject) => {
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

          for (let gridIndex = 0; gridIndex < pageDocs.length; gridIndex++) {
            const docData = pageDocs[gridIndex];
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
            if (mockOfMocks) {
              doc
                .fontSize(8)
                .text(`Customer: ${docData.customerName}`)
                .text(`Phone: ${docData.customerPhone || "N/A"}`)
                .text(`Route: ${docData.routeId}`)
                .text(`Lot: ${docData.lotNbr || "N/A"}`)
                .text(`Date: ${docData.docDate?.toLocaleDateString()}`)
                .text(`Amount: Rs. ${docData.docAmount}`)
                .text(`Status: ${docData.status || "Blank"}`)
                .moveDown(0.3);
            } else {
              //Call the ERP API to get the document details
              try {
                const response = await axios.get(
                  `${getErpBaseUrl()}/document`,
                  {
                    params: {
                      doc_id: docData.docId,
                      user: "mock-admin",
                    },
                    headers: getErpApiHeaders(),
                  }
                );

                doc
                  .fontSize(8)
                  .text(`Customer: ${response.data.customerName || "N/A"}`)
                  .text(`Phone: ${response.data.customerPhone || "N/A"}`)
                  .text(`Route: ${response.data.routeName || "N/A"}`)
                  .text(`Lot: ${response.data.lotNbr || "N/A"}`)
                  .text(`Date: ${response.data.invoiceDate || "N/A"}`)
                  .text(`Amount: Rs. ${response.data.invoiceAmount || "N/A"}`)
                  .text(`Status: ${response.data.status || "N/A"}`)
                  .moveDown(0.3);
              } catch (error) {
                console.error(
                  "Unable to hit ERP API, so showing only barcode image " +
                    error
                );
              }
            }

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
          }
        }

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  async markDelivery(
    docId: string,
    markDeliveryDto: MarkDeliveryDto,
    loggedInUser: JwtPayload,
    shouldUpdateCustomerLocation: boolean
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
    const result = await this.dataSource.transaction(async (manager) => {
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
        shouldUpdateCustomerLocation &&
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

    // Update ERP with DELIVERED status
    if (this.settingsCacheService.getUpdateDocStatusToErp()) {
      console.log("Updating doc status to ERP API");
      try {
        await axios.post(
          `${getErpApiStatusUpdateHookUrl()}`,
          {
            docId: docId,
            status: DocStatus.DELIVERED,
            userId: loggedInUser.id,
          },
          { headers: getErpApiHeaders(), timeout: 5000 }
        );
      } catch (e) {
        console.error(
          `Failed to update doc ${docId} with status ${DocStatus.DELIVERED} at ERP API:`,
          e
        );
      }
    }

    return result;
  }

  async markDeliveryFailed(
    docId: string,
    markDeliveryFailedDto: MarkDeliveryFailedDto,
    loggedInUser: JwtPayload
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

    // Update ERP with UNDELIVERED status (non-blocking)
    if (this.settingsCacheService.getUpdateDocStatusToErp()) {
      try {
        await axios.post(
          `${getErpApiStatusUpdateHookUrl()}`,
          {
            docId: docId,
            status: DocStatus.UNDELIVERED,
            userId: loggedInUser.id,
          },
          { headers: getErpApiHeaders(), timeout: 5000 }
        );
      } catch (e) {
        console.error(
          `Failed to update doc ${docId} with status ${DocStatus.UNDELIVERED} at ERP API:`,
          e
        );
      }
    }

    return {
      success: true,
      message: "Document marked as: Delivery Failed",
      docId: docId,
      statusCode: 200,
    };
  }

  async trackDocument(
    token: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<DocTrackingResponseDto> {
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

    // Log the tracking access (non-blocking)
    const trackingAccess = this.docTrackingAccessRepository.create({
      docId: docId,
      customerId: doc.customerId,
      accessedAt: new Date(),
      ipAddress: ipAddress || null,
      userAgent: userAgent || null,
    });
    this.docTrackingAccessRepository.save(trackingAccess).catch((error) => {
      // Log error but don't fail the tracking request
      console.error("Error saving tracking access:", error);
    });

    const response: DocTrackingResponseDto = {
      success: true,
      message: "Document tracking information retrieved successfully",
      docId: docId,
      docAmount: doc.docAmount as unknown as number,
      status: doc.status,
    };

    // Populate customer info if available
    if (doc.customer) {
      response.customerFirmName = doc.customer.firmName || "";
      response.customerAddress = doc.customer.address || "";
      response.customerCity = doc.customer.city || "";
      response.customerPincode = doc.customer.pincode || "";
    }

    // Handle different statuses
    switch (doc.status) {
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
        // Get trip information
        const trip = await this.tripRepository.findOne({
          where: { id: doc.tripId },
        });

        if (trip) {
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

          // Only get driver location for STARTED trips
          if (trip.status === TripStatus.STARTED && trip.startedAt) {
            // Get driver's location heartbeat that occurred after trip start time minus 1 minute
            const oneMinuteBeforeStart = new Date(
              trip.startedAt.getTime() - 60 * 1000
            );

            const driverLocation =
              await this.locationHeartbeatRepository.findOne({
                where: {
                  appUserId: trip.drivenBy,
                  receivedAt: MoreThanOrEqual(oneMinuteBeforeStart),
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

              // Calculate enrouteCustomersServiceTime and numEnrouteCustomers
              const enrouteCustomersInfo =
                await this.calculateEnrouteCustomersInfo(
                  doc,
                  trip,
                  driverLocation
                );
              response.enrouteCustomersServiceTime =
                enrouteCustomersInfo.serviceTime;
              response.numEnrouteCustomers =
                enrouteCustomersInfo.numEnrouteCustomers;

              // Calculate ETA if both customer and driver locations are available
              if (
                doc.customer &&
                doc.customer.geoLatitude &&
                doc.customer.geoLongitude &&
                driverLocation.geoLatitude &&
                driverLocation.geoLongitude
              ) {
                response.eta = await this.calculateETA(
                  driverLocation.geoLatitude,
                  driverLocation.geoLongitude,
                  doc.customer.geoLatitude,
                  doc.customer.geoLongitude
                );
              }
            } else {
              // Driver location not available
              response.enrouteCustomersServiceTime = undefined;
              response.numEnrouteCustomers = undefined;
            }
          } else {
            // Trip not started or ended - no driver location
            response.enrouteCustomersServiceTime = undefined;
            response.numEnrouteCustomers = undefined;
          }
        }
        break;

      case DocStatus.AT_TRANSIT_HUB:
      case DocStatus.READY_FOR_DISPATCH:
      case DocStatus.TRIP_SCHEDULED:
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

        // Use transit hub coordinates as driver's last known location
        if (doc.transitHubLatitude && doc.transitHubLongitude) {
          response.driverLastKnownLocation = {
            latitude: doc.transitHubLatitude,
            longitude: doc.transitHubLongitude,
            receivedAt: undefined, // Transit hub coordinates don't have a timestamp
          };
        }

        // No enrouteCustomersServiceTime or ETA calculation for transit hub status
        // since the document is not on an active trip
        break;

      default:
        // Unknown status, just return the status
        break;
    }

    // If no ETA was calculated in any of the status cases, set it to -1
    if (response.eta === undefined) {
      response.eta = -1;
    }

    // If no numEnrouteCustomers was calculated in any of the status cases, set it to -1
    if (response.numEnrouteCustomers === undefined) {
      response.numEnrouteCustomers = -1;
    }

    return response;
  }

  private async calculateEnrouteCustomersInfo(
    currentDoc: Doc,
    trip: Trip,
    driverLocation: LocationHeartbeat
  ): Promise<{
    serviceTime: number | undefined;
    numEnrouteCustomers: number | undefined;
  }> {
    try {
      // Check if current document's customer has location
      if (
        !currentDoc.customer ||
        !currentDoc.customer.geoLatitude ||
        !currentDoc.customer.geoLongitude
      ) {
        return { serviceTime: undefined, numEnrouteCustomers: undefined }; // Current customer has no location
      }

      // Get all other documents in the same trip with ON_TRIP status only
      const enrouteDocs = await this.docRepository.find({
        where: {
          tripId: trip.id,
          id: Not(currentDoc.id), // Exclude current document
          status: DocStatus.ON_TRIP,
        },
        relations: ["customer"],
      });

      if (enrouteDocs.length === 0) {
        return { serviceTime: 0, numEnrouteCustomers: 0 }; // No enroute customers to serve
      }

      // Get driver coordinates
      const driverLat = parseFloat(driverLocation.geoLatitude);
      const driverLng = parseFloat(driverLocation.geoLongitude);

      if (isNaN(driverLat) || isNaN(driverLng)) {
        return { serviceTime: undefined, numEnrouteCustomers: undefined }; // Driver location not available
      }

      // Calculate distances and sort documents by proximity to driver
      const docsWithDistance = enrouteDocs.map((doc) => {
        let distance = 0;

        if (
          doc.customer &&
          doc.customer.geoLatitude &&
          doc.customer.geoLongitude
        ) {
          const customerLat = parseFloat(doc.customer.geoLatitude);
          const customerLng = parseFloat(doc.customer.geoLongitude);

          if (!isNaN(customerLat) && !isNaN(customerLng)) {
            distance = this.calculateDistance(
              driverLat,
              driverLng,
              customerLat,
              customerLng
            );
          }
        }

        return { doc, distance };
      });

      // Sort by distance (ascending) - distance=0 naturally comes first
      docsWithDistance.sort((a, b) => a.distance - b.distance);

      // Calculate current document's position in the sorted list
      const currentCustomerLat = parseFloat(currentDoc.customer.geoLatitude);
      const currentCustomerLng = parseFloat(currentDoc.customer.geoLongitude);

      if (isNaN(currentCustomerLat) || isNaN(currentCustomerLng)) {
        return { serviceTime: undefined, numEnrouteCustomers: undefined }; // Current customer location invalid
      }

      const currentDistance = this.calculateDistance(
        driverLat,
        driverLng,
        currentCustomerLat,
        currentCustomerLng
      );

      // Find how many customers come before current customer
      let customersBeforeCurrent = 0;
      for (const docWithDistance of docsWithDistance) {
        if (docWithDistance.distance < currentDistance) {
          customersBeforeCurrent++;
        } else {
          break; // Since list is sorted, we can break here
        }
      }

      // Calculate service time: number of customers before current × 10 minutes
      const serviceTime = customersBeforeCurrent * 10;
      return { serviceTime, numEnrouteCustomers: customersBeforeCurrent };
    } catch (error) {
      console.error("Error calculating enroute customers info:", error);
      return { serviceTime: undefined, numEnrouteCustomers: undefined }; // Return undefined on error
    }
  }

  private async calculateEnrouteCustomersServiceTime(
    currentDoc: Doc,
    trip: Trip,
    driverLocation: LocationHeartbeat
  ): Promise<number | undefined> {
    const result = await this.calculateEnrouteCustomersInfo(
      currentDoc,
      trip,
      driverLocation
    );
    return result.serviceTime;
  }

  private calculateDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number
  ): number {
    // Haversine formula to calculate distance between two points
    const R = 6371; // Earth's radius in kilometers
    const dLat = this.toRadians(lat2 - lat1);
    const dLng = this.toRadians(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) *
        Math.cos(this.toRadians(lat2)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in kilometers
  }

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  private async calculateETA(
    driverLatitude: string,
    driverLongitude: string,
    customerLatitude: string,
    customerLongitude: string
  ): Promise<number> {
    try {
      const response = await axios.get(
        "https://maps.googleapis.com/maps/api/distancematrix/json",
        {
          params: {
            origins: `${driverLatitude},${driverLongitude}`,
            destinations: `${customerLatitude},${customerLongitude}`,
            departure_time: "now", // Use current time for traffic conditions
            traffic_model: "best_guess", // Consider traffic conditions
            key: GlobalConstants.GOOGLE_MAPS_API_KEY,
          },
        }
      );

      if (response.data.status === "OK" && response.data.rows.length > 0) {
        const element = response.data.rows[0].elements[0];

        if (element.status === "OK") {
          // Return duration in traffic in minutes
          const durationInSeconds =
            element.duration_in_traffic?.value || element.duration?.value;

          if (durationInSeconds != null && durationInSeconds != undefined) {
            return Math.ceil(durationInSeconds / 60); // Convert to minutes and round up
          }
        }
      }

      return -1;
    } catch (error) {
      console.error("Error calculating ETA with Google Maps");
      return -1;
    }
  }

  async getDeliveryStatus(docId: string): Promise<{
    success: boolean;
    message: string;
    docId: string;
    status: string;
    comment?: string;
    signature?: string;
    deliveredAt?: Date;
    statusCode: number;
  }> {
    // Find the document
    const doc = await this.docRepository.findOne({
      where: { id: docId },
      relations: ["customer"],
    });

    if (!doc) {
      throw new NotFoundException("Document not found in the system");
    }

    // Check if document is in a final delivery state
    if (
      doc.status !== DocStatus.DELIVERED &&
      doc.status !== DocStatus.UNDELIVERED
    ) {
      return {
        success: false,
        message: `Document is not in a final delivery state. Current status: ${doc.status}`,
        docId: docId,
        status: doc.status,
        statusCode: 400,
      };
    }

    let signature = undefined;
    let deliveredAt = undefined;

    // Get signature if document is delivered
    if (doc.status === DocStatus.DELIVERED) {
      const signatureRecord = await this.signatureRepository.findOne({
        where: { docId: docId },
      });

      if (signatureRecord) {
        // Convert signature buffer to base64 string
        signature = signatureRecord.signature.toString("base64");
        // Ensure deliveredAt is in UTC format
        deliveredAt = signatureRecord.lastUpdatedAt
          ? new Date(signatureRecord.lastUpdatedAt).toISOString()
          : undefined;
      }
    }

    return {
      success: true,
      message: `Document delivery status retrieved successfully`,
      docId: docId,
      status: doc.status,
      comment: doc.comment,
      signature: signature,
      deliveredAt: deliveredAt,
      statusCode: 200,
    };
  }

  async getRecentSignatureFromTripForCustomer(
    docId: string,
    tripId: number
  ): Promise<{
    success: boolean;
    docId: string;
    signature: string;
    lastUpdatedAt: Date;
  }> {
    const doc = await this.docRepository.findOne({ where: { id: docId } });

    if (!doc) {
      throw new NotFoundException(
        `Document with id ${docId} was not found in the system`
      );
    }

    if (doc.tripId.toString() !== tripId.toString()) {
      throw new BadRequestException(
        `Document ${docId} is not part of trip ${tripId}`
      );
    }

    if (!doc.customerId) {
      throw new BadRequestException(
        `Document ${docId} does not have an associated customer`
      );
    }

    const otherDocsForCustomer = await this.docRepository.find({
      where: {
        tripId: tripId,
        customerId: doc.customerId,
        id: Not(docId),
      },
      select: ["id"],
    });

    if (otherDocsForCustomer.length === 0) {
      throw new BadRequestException(
        "No other documents for this customer found in the trip"
      );
    }

    const docIdsToCheck = otherDocsForCustomer.map((otherDoc) => otherDoc.id);

    const recentSignature = await this.signatureRepository.findOne({
      where: {
        docId: In(docIdsToCheck),
      },
      order: {
        lastUpdatedAt: "DESC",
      },
    });

    if (!recentSignature) {
      throw new BadRequestException(
        "No recent signatures found for this customer within the trip"
      );
    }

    return {
      success: true,
      docId: recentSignature.docId,
      signature: recentSignature.signature.toString("base64"),
      lastUpdatedAt: recentSignature.lastUpdatedAt,
    };
  }
}
