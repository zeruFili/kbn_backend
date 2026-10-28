export const VERIFICATION_EMAIL_TEMPLATE = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify Your Email</title>
</head>
<body style="margin: 0; padding: 24px 0; background-color: #F4EFE3; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #4A5568;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #FFFFFF; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(15, 29, 58, 0.08); border: 1px solid #E2DFD9;">
    <!-- Brand Header -->
    <div style="background: linear-gradient(135deg, #0F1D3A 0%, #1A335C 100%); padding: 32px 24px; text-align: center; border-bottom: 3px solid #D4A853;">
      <p style="margin: 0 0 6px 0; font-size: 11px; font-weight: 700; letter-spacing: 2.5px; color: #D4A853; text-transform: uppercase;">
        Kingdom Builders Network
      </p>
      <h1 style="margin: 0; color: #FFFFFF; font-family: 'Playfair Display', Georgia, serif; font-size: 26px; font-weight: 700; letter-spacing: 0.5px;">
        Verify Your Email
      </h1>
    </div>

    <!-- Body Content -->
    <div style="padding: 36px 32px 28px 32px;">
      <p style="margin-top: 0; font-size: 15px; color: #0F1D3A; font-weight: 600;">Hello,</p>
      <p style="font-size: 14px; color: #4A5568; margin-bottom: 24px;">
        Thank you for joining <strong>Kingdom Builders Network</strong>! To complete your registration and secure your account, please enter the following verification code:
      </p>

      <!-- Verification Code Box with Brand Gold & Deep Navy -->
      <div style="text-align: center; margin: 28px 0; padding: 22px; background: #FDF6E8; border: 1px solid #E2DFD9; border-radius: 12px;">
        <span style="display: inline-block; font-size: 34px; font-weight: 800; letter-spacing: 8px; color: #0F1D3A; font-family: 'Courier New', Courier, monospace;">
          {verificationCode}
        </span>
        <p style="margin: 8px 0 0 0; font-size: 12px; color: #B8922E; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">
          One-Time Verification Code
        </p>
      </div>

      <p style="font-size: 14px; color: #4A5568;">
        Enter this code on the verification page to activate your account.
      </p>

      <div style="background-color: #F8F9FA; border-left: 3px solid #D4A853; padding: 10px 14px; border-radius: 4px; margin: 20px 0;">
        <p style="margin: 0; font-size: 13px; color: #4A5568;">
          ⏱️ This code will expire in <strong>15 minutes</strong> for security reasons.
        </p>
      </div>

      <p style="font-size: 13px; color: #8B8E96; margin-bottom: 28px;">
        If you did not initiate this registration with Kingdom Builders Network, please disregard this email.
      </p>

      <div style="border-top: 1px solid #F0EDE7; padding-top: 20px;">
        <p style="margin: 0; font-size: 14px; color: #0F1D3A; font-weight: 600;">
          Best regards,
        </p>
        <p style="margin: 2px 0 0 0; font-size: 13px; color: #D4A853; font-weight: 700;">
          Kingdom Builders Network Team
        </p>
      </div>
    </div>

    <!-- Footer -->
    <div style="background-color: #F8F9FA; padding: 18px 24px; text-align: center; border-top: 1px solid #E2DFD9;">
      <p style="margin: 0; font-size: 12px; color: #8B8E96;">
        This is an automated security notification. Please do not reply directly to this email.
      </p>
    </div>
  </div>
</body>
</html>
`;

export const PASSWORD_RESET_SUCCESS_TEMPLATE = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Password Reset Successful</title>
</head>
<body style="margin: 0; padding: 24px 0; background-color: #F4EFE3; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #4A5568;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #FFFFFF; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(15, 29, 58, 0.08); border: 1px solid #E2DFD9;">
    <!-- Brand Header -->
    <div style="background: linear-gradient(135deg, #0F1D3A 0%, #1A335C 100%); padding: 32px 24px; text-align: center; border-bottom: 3px solid #D4A853;">
      <p style="margin: 0 0 6px 0; font-size: 11px; font-weight: 700; letter-spacing: 2.5px; color: #D4A853; text-transform: uppercase;">
        Kingdom Builders Network
      </p>
      <h1 style="margin: 0; color: #FFFFFF; font-family: 'Playfair Display', Georgia, serif; font-size: 26px; font-weight: 700; letter-spacing: 0.5px;">
        Password Reset Successful
      </h1>
    </div>

    <!-- Body Content -->
    <div style="padding: 36px 32px 28px 32px;">
      <p style="margin-top: 0; font-size: 15px; color: #0F1D3A; font-weight: 600;">Hello,</p>
      <p style="font-size: 14px; color: #4A5568;">
        We are writing to confirm that the password for your Kingdom Builders Network account has been successfully updated.
      </p>

      <!-- Gold Checkmark Badge -->
      <div style="text-align: center; margin: 26px 0;">
        <div style="background: linear-gradient(135deg, #D4A853 0%, #B8922E 100%); color: #081324; width: 56px; height: 56px; line-height: 56px; border-radius: 50%; display: inline-block; font-size: 30px; font-weight: bold; box-shadow: 0 4px 14px rgba(212, 168, 83, 0.35);">
          ✓
        </div>
      </div>

      <div style="background: #FDF6E8; border: 1px solid #E2DFD9; border-radius: 12px; padding: 18px; margin: 24px 0;">
        <p style="margin: 0 0 10px 0; font-size: 13px; font-weight: 700; color: #0F1D3A;">
          Security Recommendations:
        </p>
        <ul style="margin: 0; padding-left: 20px; font-size: 13px; color: #4A5568;">
          <li style="margin-bottom: 6px;">Never share your password with anyone</li>
          <li style="margin-bottom: 6px;">Use a strong, unique password for every account</li>
          <li>Ensure your registered mobile phone and email are up to date</li>
        </ul>
      </div>

      <p style="font-size: 13px; color: #8B8E96; margin-bottom: 28px;">
        If you did not initiate this password change, please contact our support team immediately.
      </p>

      <div style="border-top: 1px solid #F0EDE7; padding-top: 20px;">
        <p style="margin: 0; font-size: 14px; color: #0F1D3A; font-weight: 600;">
          Best regards,
        </p>
        <p style="margin: 2px 0 0 0; font-size: 13px; color: #D4A853; font-weight: 700;">
          Kingdom Builders Network Team
        </p>
      </div>
    </div>

    <!-- Footer -->
    <div style="background-color: #F8F9FA; padding: 18px 24px; text-align: center; border-top: 1px solid #E2DFD9;">
      <p style="margin: 0; font-size: 12px; color: #8B8E96;">
        This is an automated security notification. Please do not reply directly to this email.
      </p>
    </div>
  </div>
</body>
</html>
`;

export const PASSWORD_RESET_REQUEST_TEMPLATE = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Password</title>
</head>
<body style="margin: 0; padding: 24px 0; background-color: #F4EFE3; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #4A5568;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #FFFFFF; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(15, 29, 58, 0.08); border: 1px solid #E2DFD9;">
    <!-- Brand Header -->
    <div style="background: linear-gradient(135deg, #0F1D3A 0%, #1A335C 100%); padding: 32px 24px; text-align: center; border-bottom: 3px solid #D4A853;">
      <p style="margin: 0 0 6px 0; font-size: 11px; font-weight: 700; letter-spacing: 2.5px; color: #D4A853; text-transform: uppercase;">
        Kingdom Builders Network
      </p>
      <h1 style="margin: 0; color: #FFFFFF; font-family: 'Playfair Display', Georgia, serif; font-size: 26px; font-weight: 700; letter-spacing: 0.5px;">
        Reset Your Password
      </h1>
    </div>

    <!-- Body Content -->
    <div style="padding: 36px 32px 28px 32px;">
      <p style="margin-top: 0; font-size: 15px; color: #0F1D3A; font-weight: 600;">Hello,</p>
      <p style="font-size: 14px; color: #4A5568; margin-bottom: 24px;">
        We received a request to reset the password for your Kingdom Builders Network account. Click the button below to choose a new password:
      </p>

      <!-- Brand Gold CTA Button -->
      <div style="text-align: center; margin: 32px 0;">
        <a href="{resetURL}" style="background: linear-gradient(135deg, #D4A853 0%, #B8922E 100%); color: #081324; font-weight: 700; font-size: 15px; text-decoration: none; padding: 14px 32px; border-radius: 10px; display: inline-block; box-shadow: 0 4px 14px rgba(212, 168, 83, 0.35); text-transform: uppercase; letter-spacing: 0.5px;">
          Reset Password
        </a>
      </div>

      <div style="background-color: #F8F9FA; border-left: 3px solid #D4A853; padding: 10px 14px; border-radius: 4px; margin: 20px 0;">
        <p style="margin: 0; font-size: 13px; color: #4A5568;">
          ⏱️ This link will expire in <strong>1 hour</strong> for security reasons.
        </p>
      </div>

      <p style="font-size: 13px; color: #8B8E96; margin-bottom: 28px;">
        If you did not request a password reset, please ignore this email. Your current password remains secure and active.
      </p>

      <div style="border-top: 1px solid #F0EDE7; padding-top: 20px;">
        <p style="margin: 0; font-size: 14px; color: #0F1D3A; font-weight: 600;">
          Best regards,
        </p>
        <p style="margin: 2px 0 0 0; font-size: 13px; color: #D4A853; font-weight: 700;">
          Kingdom Builders Network Team
        </p>
      </div>
    </div>

    <!-- Footer -->
    <div style="background-color: #F8F9FA; padding: 18px 24px; text-align: center; border-top: 1px solid #E2DFD9;">
      <p style="margin: 0; font-size: 12px; color: #8B8E96;">
        This is an automated security notification. Please do not reply directly to this email.
      </p>
    </div>
  </div>
</body>
</html>
`;
