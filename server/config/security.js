// Security Configuration
// server/config/security.js

const securityConfig = {
  // Environment-specific settings
  environment: process.env.NODE_ENV || 'development',
  
  // Authentication settings
  auth: {
    tokenMaxAge: parseInt(process.env.TOKEN_MAX_AGE_SECONDS) || 3600, // 1 hour
    refreshTokenMaxAge: 30 * 24 * 60 * 60, // 30 days
    passwordMinLength: 8,
    passwordRequirements: {
      minLength: 8,
      requireUppercase: true,
      requireLowercase: true,
      requireNumbers: true,
      requireSpecialChars: true
    }
  },
  
  // Rate limiting configuration
  rateLimiting: {
    // Global limits
    global: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: process.env.NODE_ENV === 'production' ? 20000 : 50000
    },
    
    // Endpoint-specific limits
    endpoints: {
      auth: {
        windowMs: 15 * 60 * 1000,
        max: process.env.NODE_ENV === 'production' ? 3000 : 10000
      },
      maps: {
        windowMs: 15 * 60 * 1000,
        max: process.env.NODE_ENV === 'production' ? 50000 : 100000
      },
      gallery: {
        windowMs: 15 * 60 * 1000,
        max: process.env.NODE_ENV === 'production' ? 10000 : 20000
      },
      journey: {
        windowMs: 15 * 60 * 1000,
        max: process.env.NODE_ENV === 'production' ? 300000 : 500000
      },
      groupJourney: {
        windowMs: 15 * 60 * 1000,
        max: process.env.NODE_ENV === 'production' ? 150000 : 300000
      },
      group: {
        windowMs: 15 * 60 * 1000,
        max: process.env.NODE_ENV === 'production' ? 50000 : 100000
      },
      user: {
        windowMs: 15 * 60 * 1000,
        max: process.env.NODE_ENV === 'production' ? 20000 : 50000
      },
      leaderboard: {
        windowMs: 15 * 60 * 1000,
        max: process.env.NODE_ENV === 'production' ? 15000 : 30000
      }
    }
  },
  
  // File upload security
  fileUpload: {
    maxFileSize: {
      profilePicture: 5 * 1024 * 1024, // 5MB
      groupCover: 8 * 1024 * 1024, // 8MB
      journeyPhoto: 10 * 1024 * 1024 // 10MB
    },
    allowedMimeTypes: [
      'image/jpeg',
      'image/png', 
      'image/gif',
      'image/webp'
    ],
    allowedExtensions: [
      '.jpg', '.jpeg', '.png', '.gif', '.webp'
    ],
    dangerousPatterns: [
      '.php', '.exe', '.bat', '.cmd', '.sh', '.js', '.html', '.htm',
      '.phtml', '.phar', '.htaccess', '.env', '.config'
    ],
    imageDimensions: {
      maxWidth: 5000,
      maxHeight: 5000,
      profilePicture: { width: 300, height: 300 },
      groupCover: { width: 1200, height: 600 }
    }
  },
  
  // CORS configuration
  cors: {
    allowedOrigins: process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : [],
    allowAllOrigins: process.env.NODE_ENV !== 'production',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
    exposedHeaders: ['X-Cache', 'X-Cache-Key']
  },
  
  // Input validation
  validation: {
    maxStringLength: {
      displayName: 50,
      description: 500,
      email: 254,
      phoneNumber: 20
    },
    coordinateRanges: {
      latitude: { min: -90, max: 90 },
      longitude: { min: -180, max: 180 }
    }
  },
  
  // Security headers
  headers: {
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "https:", "wss:"]
      }
    }
  },
  
  // Session security
  session: {
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
  },
  
  // Logging and monitoring
  logging: {
    securityEvents: true,
    failedAuthAttempts: true,
    fileUploads: true,
    rateLimitExceeded: true,
    inputValidationFailures: true
  },
  
  // API security
  api: {
    version: '1.0.0',
    requestSigning: process.env.NODE_ENV === 'production',
    enableApiKeys: false, // Consider implementing for external integrations
    maxRequestBodySize: '10mb'
  }
};

// Environment-specific overrides
if (securityConfig.environment === 'production') {
  securityConfig.cors.allowAllOrigins = false;
  securityConfig.session.cookie.secure = true;
  securityConfig.api.requestSigning = true;
}

if (securityConfig.environment === 'development') {
  securityConfig.cors.allowAllOrigins = true;
  securityConfig.session.cookie.secure = false;
  securityConfig.rateLimiting.global.max = 500;
}

// Validation functions
securityConfig.validateEnvironment = () => {
  const requiredEnvVars = [
    'DATABASE_URL',
    'FIREBASE_PROJECT_ID',
    'FIREBASE_CLIENT_EMAIL',
    'FIREBASE_PRIVATE_KEY'
  ];
  
  const missing = requiredEnvVars.filter(envVar => !process.env[envVar]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  
  return true;
};

// Security audit function
securityConfig.audit = () => {
  const warnings = [];
  
  // Check for weak passwords in development
  if (securityConfig.environment === 'development') {
    if (process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD.length < 8) {
      warnings.push('Admin password is too weak for production');
    }
  }
  
  // Check for default secrets
  const defaultSecrets = [
    'your-secret-key',
    'change-me',
    'default-secret',
    'temp-secret'
  ];
  
  if (process.env.JWT_SECRET && defaultSecrets.includes(process.env.JWT_SECRET)) {
    warnings.push('JWT secret is using a default value');
  }
  
  return warnings;
};

module.exports = securityConfig;