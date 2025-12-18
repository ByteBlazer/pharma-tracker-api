import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../guards/jwt-auth.guard";
import { RequireRoles } from "../decorators/require-roles.decorator";
import { ReportService } from "../services/report.service";
import { DeliveryReportQueryDto } from "../dto/delivery-report-query.dto";
import { DeliveryReportResponseDto } from "../dto/delivery-report-response.dto";

@Controller("report")
@UseGuards(JwtAuthGuard)
@RequireRoles()
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  @Get("delivery-report-data")
  async getDeliveryReportData(
    @Query() queryDto: DeliveryReportQueryDto
  ): Promise<DeliveryReportResponseDto> {
    return await this.reportService.getDeliveryReportData(queryDto);
  }
}
