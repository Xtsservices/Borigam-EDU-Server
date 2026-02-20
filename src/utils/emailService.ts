import nodemailer from 'nodemailer';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

interface CredentialsEmailData {
  firstName: string;
  lastName?: string;
  email: string;
  tempPassword: string;
  role: string;
}

interface PasswordResetEmailData {  
  firstName: string;
  resetLink: string;
  email: string;
}

export class EmailService {
  private static transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD
    }
  });

  /**
   * Send general email
   */
  static async sendEmail(options: EmailOptions): Promise<boolean> {
    try {
      const mailOptions = {
        from: `"Borigam Education" <${process.env.SMTP_USER}>`,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text || ''
      };

      await this.transporter.sendMail(mailOptions);
      console.log(`✅ Email sent successfully to ${options.to}`);
      return true;
    } catch (error) {
      console.error('❌ Failed to send email:', error);
      return false;
    }
  }

  /**
   * Send credentials email to newly created users
   */
  static async sendCredentialsEmail(data: CredentialsEmailData): Promise<boolean> {
    const { firstName, lastName, email, tempPassword, role } = data;
    const fullName = `${firstName}${lastName ? ' ' + lastName : ''}`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          .container { max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif; }
          .header { background: #2c3e50; color: white; padding: 20px; text-align: center; }
          .content { padding: 30px; background: #f8f9fa; }
          .credentials { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .button { background: #3498db; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 20px 0; }
          .footer { background: #34495e; color: white; padding: 20px; text-align: center; font-size: 12px; }
          .warning { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 6px; margin: 15px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Welcome to Borigam Education Platform</h1>
          </div>
          <div class="content">
            <h2>Hello ${fullName},</h2>
            <p>Your account has been created successfully as a <strong>${role}</strong> in our education platform.</p>
            
            <div class="credentials">
              <h3>Your Login Credentials:</h3>
              <p><strong>Email:</strong> ${email}</p>
              <p><strong>Temporary Password:</strong> ${tempPassword}</p>
            </div>

            <div class="warning">
              <h4>⚠️ Important Security Information:</h4>
              <ul>
                <li>This is a temporary password for your first login</li>
                <li>Please change your password immediately after login</li>
                <li>Keep your credentials secure and do not share them</li>
              </ul>
            </div>

            <a href="${process.env.FRONTEND_URL || 'http://localhost:3001'}/login" class="button">
              Login to Your Account
            </a>

            <p>If you have any questions or need assistance, please contact our support team.</p>
          </div>
          <div class="footer">
            <p>© 2026 Borigam Education. All rights reserved.</p>
            <p>This email contains sensitive information. Please keep it confidential.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
      Welcome to Borigam Education Platform!
      
      Hello ${fullName},
      
      Your account has been created successfully as a ${role}.
      
      Login Credentials:
      Email: ${email}
      Temporary Password: ${tempPassword}
      
      Important: This is a temporary password. Please change it after your first login.
      
      Login URL: ${process.env.FRONTEND_URL || 'http://localhost:3001'}/login
    `;

    return this.sendEmail({
      to: email,
      subject: 'Welcome to Borigam Education - Your Account Credentials',
      html,
      text
    });
  }

  /**
   * Send password reset email
   */
  static async sendPasswordResetEmail(data: PasswordResetEmailData): Promise<boolean> {
    const { firstName, resetLink, email } = data;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          .container { max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif; }
          .header { background: #e74c3c; color: white; padding: 20px; text-align: center; }
          .content { padding: 30px; background: #f8f9fa; }
          .button { background: #e74c3c; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 20px 0; }
          .footer { background: #34495e; color: white; padding: 20px; text-align: center; font-size: 12px; }
          .warning { background: #ffeaa7; border: 1px solid #fdcb6e; padding: 15px; border-radius: 6px; margin: 15px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Password Reset Request</h1>
          </div>
          <div class="content">
            <h2>Hello ${firstName},</h2>
            <p>We received a request to reset your password for your Borigam Education account.</p>
            
            <a href="${resetLink}" class="button">Reset Your Password</a>
            
            <div class="warning">
              <h4>⚠️ Security Notice:</h4>
              <ul>
                <li>This link will expire in 1 hour for security reasons</li>
                <li>If you didn't request this reset, please ignore this email</li>
                <li>Never share this reset link with anyone</li>
              </ul>
            </div>

            <p>If the button doesn't work, copy and paste this link into your browser:</p>
            <p style="word-break: break-all; background: #ecf0f1; padding: 10px; border-radius: 4px;">${resetLink}</p>
          </div>
          <div class="footer">
            <p>© 2026 Borigam Education. All rights reserved.</p>
            <p>If you have any questions, contact our support team.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
      Password Reset Request - Borigam Education
      
      Hello ${firstName},
      
      We received a request to reset your password.
      
      Reset your password: ${resetLink}
      
      This link will expire in 1 hour.
      If you didn't request this reset, please ignore this email.
    `;

    return this.sendEmail({
      to: email,
      subject: 'Password Reset Request - Borigam Education',
      html,
      text
    });
  }

  /**
   * Generate temporary password
   */
  static generateTempPassword(): string {
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const symbols = '@#$%&*';
    
    let password = '';
    
    // Ensure at least one of each type
    password += uppercase.charAt(Math.floor(Math.random() * uppercase.length));
    password += lowercase.charAt(Math.floor(Math.random() * lowercase.length));
    password += numbers.charAt(Math.floor(Math.random() * numbers.length));
    password += symbols.charAt(Math.floor(Math.random() * symbols.length));
    
    // Fill the rest randomly (8 chars total)
    const allChars = uppercase + lowercase + numbers + symbols;
    for (let i = 4; i < 8; i++) {
      password += allChars.charAt(Math.floor(Math.random() * allChars.length));
    }
    
    // Shuffle the password
    return password.split('').sort(() => 0.5 - Math.random()).join('');
  }
}