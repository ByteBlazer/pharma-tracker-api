import { DataSource } from "typeorm";
import { ApiOutboundLog } from "../entities/api-outbound-log.entity";
import axios, {
  AxiosResponse,
  AxiosError,
  InternalAxiosRequestConfig,
} from "axios";

let dataSource: DataSource | null = null;

/**
 * Initialize the ERP API logger with a DataSource instance
 * This should be called after the app is created in bootstrap()
 */
export function initializeErpApiLogger(ds: DataSource): void {
  dataSource = ds;
}

/**
 * Log an ERP API call to the database asynchronously
 * This function is non-blocking and will not throw errors
 */
async function logErpApiCall(logData: {
  endpoint: string;
  method: string;
  httpStatus?: number | null;
  responseTimeMs?: number | null;
  requestBody?: any;
  responseBody?: any;
  errorMessage?: string | null;
  success: boolean;
}): Promise<void> {
  // Don't block if DataSource is not initialized
  if (!dataSource) {
    return;
  }

  try {
    const log = new ApiOutboundLog();
    log.endpoint = logData.endpoint;
    log.method = logData.method;
    log.httpStatus = logData.httpStatus ?? null;
    log.responseTimeMs = logData.responseTimeMs ?? null;
    log.requestBody = logData.requestBody ?? null;
    log.responseBody = logData.responseBody ?? null;
    log.errorMessage = logData.errorMessage ?? null;
    log.success = logData.success;

    // Use void to make this non-blocking
    void dataSource.getRepository(ApiOutboundLog).save(log);
  } catch (error) {
    // Silently fail - we don't want logging errors to break the application
    console.error("Failed to log ERP API call:", error.message);
  }
}

/**
 * Check if a URL is an ERP API endpoint
 */
function isErpApiUrl(url: string | undefined): boolean {
  if (!url) {
    return false;
  }
  const erpBaseUrl = process.env.ERP_API_BASE_URL;
  if (!erpBaseUrl) {
    return false;
  }
  return url.includes(erpBaseUrl);
}

/**
 * Configure axios interceptor to log ERP API calls
 * This should be called after initializeErpApiLogger()
 */
export function configureErpApiLogging(): void {
  const erpBaseUrl = process.env.ERP_API_BASE_URL;
  if (!erpBaseUrl) {
    console.log("⚠️  ERP_API_BASE_URL not set, skipping ERP API logging");
    return;
  }

  // Request interceptor to capture request start time
  axios.interceptors.request.use(
    (config: InternalAxiosRequestConfig) => {
      // Store start time for response time calculation
      if (isErpApiUrl(config.url)) {
        (config as any).__erpApiStartTime = Date.now();
      }
      return config;
    },
    (error: AxiosError) => {
      // Log request errors for ERP API calls
      if (error.config && isErpApiUrl(error.config.url)) {
        const endpoint = error.config.url || "unknown";
        const method = (error.config.method || "unknown").toUpperCase();
        let requestBody = null;
        if (error.config.data) {
          if (typeof error.config.data === "string") {
            try {
              requestBody = JSON.parse(error.config.data);
            } catch {
              requestBody = error.config.data;
            }
          } else {
            requestBody = error.config.data;
          }
        }

        void logErpApiCall({
          endpoint,
          method,
          requestBody,
          errorMessage: error.message || "Request failed before sending",
          success: false,
        });
      }
      return Promise.reject(error);
    }
  );

  // Response interceptor to log successful and failed responses
  axios.interceptors.response.use(
    (response: AxiosResponse) => {
      if (isErpApiUrl(response.config.url)) {
        const startTime = (response.config as any).__erpApiStartTime;
        const responseTimeMs = startTime ? Date.now() - startTime : null;

        const endpoint = response.config.url || "unknown";
        const method = (response.config.method || "unknown").toUpperCase();
        let requestBody = null;
        if (response.config.data) {
          if (typeof response.config.data === "string") {
            try {
              requestBody = JSON.parse(response.config.data);
            } catch {
              requestBody = response.config.data;
            }
          } else {
            requestBody = response.config.data;
          }
        }

        // Limit response body size to prevent huge logs
        let responseBody = response.data;
        if (responseBody && typeof responseBody === "object") {
          const jsonString = JSON.stringify(responseBody);
          if (jsonString.length > 10000) {
            // Truncate large responses
            responseBody = {
              _truncated: true,
              _originalLength: jsonString.length,
              _preview: JSON.parse(jsonString),
            };
          }
        }

        void logErpApiCall({
          endpoint,
          method,
          httpStatus: response.status,
          responseTimeMs,
          requestBody,
          responseBody,
          success: true,
        });
      }
      return response;
    },
    (error: AxiosError) => {
      if (error.config && isErpApiUrl(error.config.url)) {
        const startTime = (error.config as any).__erpApiStartTime;
        const responseTimeMs = startTime ? Date.now() - startTime : null;

        const endpoint = error.config.url || "unknown";
        const method = (error.config.method || "unknown").toUpperCase();
        let requestBody = null;
        if (error.config.data) {
          if (typeof error.config.data === "string") {
            try {
              requestBody = JSON.parse(error.config.data);
            } catch {
              requestBody = error.config.data;
            }
          } else {
            requestBody = error.config.data;
          }
        }

        let httpStatus: number | null = null;
        let responseBody: any = null;
        let errorMessage: string | null = null;

        if (error.response) {
          // Server responded with error status
          httpStatus = error.response.status;
          responseBody = error.response.data;
          errorMessage = `HTTP ${error.response.status}: ${error.response.statusText}`;
        } else if (error.request) {
          // Request was made but no response received
          errorMessage = "No response received from server";
        } else {
          // Something else happened
          errorMessage = error.message || "Unknown error";
        }

        // Limit response body size
        if (responseBody && typeof responseBody === "object") {
          const jsonString = JSON.stringify(responseBody);
          if (jsonString.length > 10000) {
            responseBody = {
              _truncated: true,
              _originalLength: jsonString.length,
              _preview: JSON.parse(jsonString.substring(0, 1000)),
            };
          }
        }

        void logErpApiCall({
          endpoint,
          method,
          httpStatus,
          responseTimeMs,
          requestBody,
          responseBody,
          errorMessage,
          success: false,
        });
      }
      return Promise.reject(error);
    }
  );

  console.log("🔧 ERP API logging interceptor configured");
}
