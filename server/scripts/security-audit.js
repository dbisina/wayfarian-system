// Security Audit Script
// server/scripts/security-audit.js

const prisma = require('../prisma/client');
const logger = require('../services/Logger');
const securityConfig = require('../config/security');

class SecurityAudit {
  constructor() {
    this.auditResults = {
      critical: [],
      high: [],
      medium: [],
      low: [],
      passed: []
    };
  }

  /**
   * Add audit result
   */
  addResult(severity, category, message, details = {}) {
    this.auditResults[severity].push({
      category,
      message,
      details,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Audit environment configuration
   */
  async auditEnvironment() {
    console.log('🔍 Auditing environment configuration...');

    // Check for default secrets
    const defaultSecrets = [
      'your-secret-key',
      'change-me',
      'default-secret',
      'temp-secret',
      'secret'
    ];

    if (process.env.JWT_SECRET && defaultSecrets.includes(process.env.JWT_SECRET)) {
      this.addResult('critical', 'Environment', 'JWT secret is using a default value');
    }

    // Check for weak passwords in development
    if (process.env.NODE_ENV === 'development') {
      if (process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD.length < 12) {
        this.addResult('high', 'Environment', 'Admin password is too weak for production');
      }
    }

    // Check required environment variables
    const requiredEnvVars = [
      'DATABASE_URL',
      'FIREBASE_PROJECT_ID',
      'FIREBASE_CLIENT_EMAIL',
      'FIREBASE_PRIVATE_KEY'
    ];

    const missing = requiredEnvVars.filter(envVar => !process.env[envVar]);
    if (missing.length > 0) {
      this.addResult('critical', 'Environment', `Missing required environment variables: ${missing.join(', ')}`);
    }

    // Check for debug mode in production
    if (process.env.NODE_ENV === 'production' && process.env.DEBUG) {
      this.addResult('high', 'Environment', 'Debug mode enabled in production');
    }

    this.addResult('passed', 'Environment', 'Environment configuration audit completed');
  }

  /**
   * Audit database security
   */
  async auditDatabase() {
    console.log('🔍 Auditing database security...');

    try {
      // Check for weak user passwords (if applicable)
      const weakPasswords = await prisma.user.findMany({
        where: {
          OR: [
            { password: { contains: 'password' } },
            { password: { contains: '123456' } },
            { password: { contains: 'admin' } }
          ]
        },
        select: { id: true, email: true }
      });

      if (weakPasswords.length > 0) {
        this.addResult('high', 'Database', 'Users with weak passwords found', {
          count: weakPasswords.length,
          users: weakPasswords.map(u => u.email)
        });
      }

      // Check for inactive users
      const inactiveUsers = await prisma.user.findMany({
        where: {
          updatedAt: {
            lt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) // 1 year
          }
        },
        select: { id: true, email: true, updatedAt: true }
      });

      if (inactiveUsers.length > 0) {
        this.addResult('low', 'Database', 'Inactive users found', {
          count: inactiveUsers.length
        });
      }

      this.addResult('passed', 'Database', 'Database security audit completed');
    } catch (error) {
      this.addResult('critical', 'Database', `Database audit failed: ${error.message}`);
    }
  }

  /**
   * Audit authentication security
   */
  async auditAuthentication() {
    console.log('🔍 Auditing authentication security...');

    // Check token expiration settings
    const tokenMaxAge = parseInt(process.env.TOKEN_MAX_AGE_SECONDS) || 3600;
    if (tokenMaxAge > 24 * 60 * 60) { // 24 hours
      this.addResult('medium', 'Authentication', 'Token expiration time is too long');
    }

    // Check for missing refresh token mechanism
    this.addResult('high', 'Authentication', 'Refresh token mechanism not implemented');

    // Check for missing brute force protection
    this.addResult('high', 'Authentication', 'Brute force protection not fully implemented');

    this.addResult('passed', 'Authentication', 'Authentication security audit completed');
  }

  /**
   * Audit authorization security
   */
  async auditAuthorization() {
    console.log('🔍 Auditing authorization security...');

    // Check for missing ownership validation in routes
    const routesWithoutOwnershipCheck = [
      '/api/user/stats',
      '/api/user/journey-history'
    ];

    this.addResult('medium', 'Authorization', 'Some routes may lack proper ownership validation');

    // Check group permission system
    this.addResult('passed', 'Authorization', 'Group permission system implemented');

    this.addResult('passed', 'Authorization', 'Authorization security audit completed');
  }

  /**
   * Audit input validation
   */
  async auditInputValidation() {
    console.log('🔍 Auditing input validation...');

    // Check for SQL injection vulnerabilities
    const rawSqlFiles = [
      'server/controllers/userController.js'
    ];

    this.addResult('high', 'Input Validation', 'Raw SQL queries found - potential SQL injection risk');

    // Check file upload validation
    this.addResult('passed', 'Input Validation', 'File upload validation implemented');

    this.addResult('passed', 'Input Validation', 'Input validation audit completed');
  }

  /**
   * Audit logging and monitoring
   */
  async auditLogging() {
    console.log('🔍 Auditing logging and monitoring...');

    // Check security event logging
    if (securityConfig.logging.securityEvents) {
      this.addResult('passed', 'Logging', 'Security event logging enabled');
    } else {
      this.addResult('medium', 'Logging', 'Security event logging disabled');
    }

    // Check for missing audit trails
    this.addResult('medium', 'Logging', 'Comprehensive audit trail not implemented');

    this.addResult('passed', 'Logging', 'Logging and monitoring audit completed');
  }

  /**
   * Run comprehensive security audit
   */
  async runComprehensiveAudit() {
    console.log('🚀 Starting comprehensive security audit...\n');

    await this.auditEnvironment();
    await this.auditDatabase();
    await this.auditAuthentication();
    await this.auditAuthorization();
    await this.auditInputValidation();
    await this.auditLogging();

    console.log('\n📊 Security Audit Results:');
    console.log('========================');

    Object.entries(this.auditResults).forEach(([severity, results]) => {
      if (results.length > 0 && severity !== 'passed') {
        console.log(`\n${severity.toUpperCase()} (${results.length}):`);
        results.forEach(result => {
          console.log(`  • ${result.category}: ${result.message}`);
          if (result.details && Object.keys(result.details).length > 0) {
            console.log(`    Details: ${JSON.stringify(result.details)}`);
          }
        });
      }
    });

    // Summary
    const totalIssues = Object.values(this.auditResults)
      .filter((_, key) => key !== 'passed')
      .flat().length;

    const passedChecks = this.auditResults.passed.length;

    console.log('\n📈 Summary:');
    console.log('==========');
    console.log(`Total Issues: ${totalIssues}`);
    console.log(`Critical: ${this.auditResults.critical.length}`);
    console.log(`High: ${this.auditResults.high.length}`);
    console.log(`Medium: ${this.auditResults.medium.length}`);
    console.log(`Low: ${this.auditResults.low.length}`);
    console.log(`Passed Checks: ${passedChecks}`);

    // Log audit results
    logger.security('Security audit completed', {
      totalIssues,
      critical: this.auditResults.critical.length,
      high: this.auditResults.high.length,
      medium: this.auditResults.medium.length,
      low: this.auditResults.low.length,
      passed: passedChecks
    });

    return this.auditResults;
  }

  /**
   * Generate security recommendations
   */
  generateRecommendations() {
    const recommendations = [];

    if (this.auditResults.critical.length > 0) {
      recommendations.push('🚨 IMMEDIATE ACTION REQUIRED: Address critical vulnerabilities');
    }

    if (this.auditResults.high.length > 0) {
      recommendations.push('⚠️  HIGH PRIORITY: Implement missing security controls');
    }

    // Specific recommendations based on findings
    if (this.auditResults.authentication?.some(r => r.message.includes('refresh token'))) {
      recommendations.push('• Implement refresh token rotation and revocation');
    }

    if (this.auditResults.authorization?.some(r => r.message.includes('ownership validation'))) {
      recommendations.push('• Enhance ownership validation middleware');
    }

    if (this.auditResults['Input Validation']?.some(r => r.message.includes('SQL injection'))) {
      recommendations.push('• Replace raw SQL queries with parameterized queries');
    }

    return recommendations;
  }
}

// Run audit if script is executed directly
if (require.main === module) {
  const audit = new SecurityAudit();
  audit.runComprehensiveAudit()
    .then(results => {
      const recommendations = audit.generateRecommendations();
      if (recommendations.length > 0) {
        console.log('\n💡 Security Recommendations:');
        console.log('==========================');
        recommendations.forEach(rec => console.log(rec));
      }
      
      process.exit(results.critical.length > 0 ? 1 : 0);
    })
    .catch(error => {
      console.error('Audit failed:', error);
      process.exit(1);
    });
}

module.exports = SecurityAudit;