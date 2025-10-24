/**
 * ERP API Utility Functions
 * Provides environment-aware ERP API configuration
 */

export function getErpBaseUrl(): string {
  return process.env.ERP_API_BASE_URL;
}

export function getErpApiHeaders(): { [key: string]: string } {
  return {
    "x-api-prod-code": process.env.ERP_API_PROD_CODE,
    "x-api-token": process.env.ERP_API_TOKEN,
  };
}

export function getErpApiStatusUpdateHookUrl(): string {
  return getErpBaseUrl() + "/document/status";
}
