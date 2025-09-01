export class GlobalConstants {
  static readonly SMS_GENERATE_OTP_TEMPLATE =
    "https://2factor.in/API/V1/{apikey}/SMS/{mobilePhone}/AUTOGEN/{otpTemplateName}";
  static readonly SMS_VALIDATE_OTP_TEMPLATE =
    "https://2factor.in/API/V1/{apikey}/SMS/VERIFY3/{mobilePhone}/{otp}";
  static readonly SEND_SMS_URL_TEMPLATE =
    "https://2factor.in/API/R1/?module=TRANS_SMS&apikey={apikey}&to={recipientMobileNumber}&from=BTBLZR&templatename={smsTemplateName}";
  static readonly SMS_OTP_TEMPLATE = "SAL_OTP";
}
