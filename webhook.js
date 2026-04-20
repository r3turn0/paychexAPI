/**
 * webhook.js - Paychex Webhook Server
 *
 * Purpose:
 *  - Start a local HTTP server that receives Paychex webhook events at /webhook.
 *  - Offer a health check endpoint at /health and a self-test endpoint at /test.
 *  - Register Paychex webhook subscriptions for employee and worker events.
 *
 * Function flow:
 *  - Incoming POST /webhook requests are parsed and forwarded to processWebhookEvent().
 *  - processWebhookEvent() uses getAccessToken() and getCompanyId() from index.js.
 *  - It routes events to handleNewEmployee(), handleStatusChange(), or handleEmployeeUpdate()
 *    based on the webhook domain.
 *  - registerWebhooks() calls addWebhook() to subscribe Paychex events to this server.
 *  - testWebhook() sends a local sample payload to /webhook so you can verify behavior.
 *
 * Usage:
 *  - Start server: `node webhook.js`
 *  - Register webhooks: `node webhook.js register`
 *  - List registered webhooks: `node webhook.js list`
 *  - Local test run: `node webhook.js test`
 *
 * Environment:
 *  - WEBHOOK_PORT defaults to 3000 if unset.
 *  - WEBHOOK_URL defaults to http://localhost:${WEBHOOK_PORT}/webhook if unset.
 */

const http = require('http');
const url = require('url');
require('dotenv').config();

// Import functions from index.js
const {
  getAccessToken,
  getCompanyId,
  sendDirectDeposit,
  sendFederalTax,
  sendStateTax,
  getWorkerStatus,
  addWebhook,
  getWebhooks,
  getWebhook,
  getManagementDomains
} = require('./index.js');

const apiURL = new url.URL('https://api.paychex.com/auth/oauth/v2/token');
const WEBHOOK_PORT = process.env.WEBHOOK_PORT || 3000;
const WEBHOOK_URL = process.env.WEBHOOK_URL || `http://localhost:${WEBHOOK_PORT}/webhook`;

/**
 * Create a webhook server to receive events from Paychex API
 * Listens for employee addition and status change events
 */
const webhookServer = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);

  // Handle webhook endpoint
  if (parsedUrl.pathname === '/webhook' && req.method === 'POST') {
    let body = '';

    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const webhookPayload = JSON.parse(body);
        console.log('[WEBHOOK] Received event:', {
          domain: webhookPayload.domain,
          eventId: webhookPayload.eventId,
          timestamp: new Date().toISOString()
        });

        // Process webhook based on domain
        await processWebhookEvent(webhookPayload);

        // Respond with 200 OK
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'success', eventId: webhookPayload.eventId }));
      } catch (error) {
        console.error('[WEBHOOK ERROR] Failed to process webhook:', error);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'error', message: error.message }));
      }
    });
  }
  // Health check endpoint
  else if (parsedUrl.pathname === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'healthy', timestamp: new Date().toISOString() }));
  }
  // Test endpoint
  else if (parsedUrl.pathname === '/test' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      message: 'Webhook server is running',
      listeningOn: `http://localhost:${WEBHOOK_PORT}`,
      webhookEndpoint: `${WEBHOOK_URL}`
    }));
  }
  else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Endpoint not found' }));
  }
});

/**
 * Process incoming webhook events from Paychex
 * Handles new employee creation and status changes
 */
async function processWebhookEvent(webhookPayload) {
  const { domain, eventId, data } = webhookPayload;

  try {
    // Get access token for API calls
    const tokenResponse = await getAccessToken(apiURL);
    const accessToken = tokenResponse.access_token;
    const companyId = await getCompanyId(accessToken);

    // Handle employee addition (WRKR_EMPL domain)
    if (domain === 'WRKR_EMPL') {
      console.log(`[WEBHOOK] Processing new employee: ${eventId}`);
      await handleNewEmployee(data, accessToken, companyId, eventId);
    }
    // Handle status changes (WRKR_TAX - tax/status related, WRKR_CMP - compensation changes)
    else if (domain === 'WRKR_TAX' || domain === 'WRKR_CMP' || domain === 'WRKR_ASGN') {
      console.log(`[WEBHOOK] Processing status change for domain ${domain}: ${eventId}`);
      await handleStatusChange(data, accessToken, companyId, domain, eventId);
    }
    // Handle other domain changes
    else if (domain === 'WRKR_ADD' || domain === 'WRKR_DEM') {
      console.log(`[WEBHOOK] Processing ${domain} changes: ${eventId}`);
      await handleEmployeeUpdate(data, accessToken, companyId, domain, eventId);
    }
    else {
      console.log(`[WEBHOOK] Unhandled domain: ${domain}`);
    }
  } catch (error) {
    console.error(`[WEBHOOK ERROR] Error processing event ${eventId}:`, error);
    throw error;
  }
}

/**
 * Handle new employee addition event
 */
async function handleNewEmployee(employeeData, accessToken, companyId, eventId) {
  try {
    console.log(`[NEW EMPLOYEE] Employee ID: ${employeeData.workerId}`);
    console.log(`[NEW EMPLOYEE] Name: ${employeeData.givenName} ${employeeData.familyName}`);
    
    // Log employee details for verification
    console.log('[NEW EMPLOYEE] Full payload:', JSON.stringify(employeeData, null, 2));

    // Get worker status
    const workerStatus = await getWorkerStatus({ workerId: employeeData.workerId }, accessToken);
    console.log(`[NEW EMPLOYEE] Worker status retrieved:`, workerStatus);

    // Optional: Trigger initial onboarding tasks
    // - Send default federal/state tax withholding
    // - Setup direct deposit
    // Add your onboarding logic here
    
    console.log(`[NEW EMPLOYEE] Successfully processed event ${eventId}`);
  } catch (error) {
    console.error(`[NEW EMPLOYEE ERROR] Failed to process new employee:`, error);
    throw error;
  }
}

/**
 * Handle employee status changes
 */
async function handleStatusChange(statusData, accessToken, companyId, domain, eventId) {
  try {
    const workerId = statusData.workerId;
    console.log(`[STATUS CHANGE] Worker ID: ${workerId}`);
    console.log(`[STATUS CHANGE] Domain: ${domain}`);
    console.log(`[STATUS CHANGE] Full payload:`, JSON.stringify(statusData, null, 2));

    // Get current worker status
    const currentStatus = await getWorkerStatus({ workerId }, accessToken);
    console.log(`[STATUS CHANGE] Current status:`, currentStatus);

    // Process status-specific logic
    if (domain === 'WRKR_TAX') {
      console.log(`[STATUS CHANGE] Tax information changed for worker ${workerId}`);
      // Handle tax status changes
    } else if (domain === 'WRKR_CMP') {
      console.log(`[STATUS CHANGE] Compensation information changed for worker ${workerId}`);
      // Handle compensation changes
    } else if (domain === 'WRKR_ASGN') {
      console.log(`[STATUS CHANGE] Assignment information changed for worker ${workerId}`);
      // Handle assignment changes
    }

    console.log(`[STATUS CHANGE] Successfully processed event ${eventId}`);
  } catch (error) {
    console.error(`[STATUS CHANGE ERROR] Failed to process status change:`, error);
    throw error;
  }
}

/**
 * Handle other employee data updates (address, demographics, etc.)
 */
async function handleEmployeeUpdate(updateData, accessToken, companyId, domain, eventId) {
  try {
    const workerId = updateData.workerId;
    console.log(`[EMPLOYEE UPDATE] Worker ID: ${workerId}`);
    console.log(`[EMPLOYEE UPDATE] Domain: ${domain}`);
    console.log(`[EMPLOYEE UPDATE] Full payload:`, JSON.stringify(updateData, null, 2));

    if (domain === 'WRKR_ADD') {
      console.log(`[EMPLOYEE UPDATE] Address information updated for worker ${workerId}`);
    } else if (domain === 'WRKR_DEM') {
      console.log(`[EMPLOYEE UPDATE] Demographic information updated for worker ${workerId}`);
    }

    console.log(`[EMPLOYEE UPDATE] Successfully processed event ${eventId}`);
  } catch (error) {
    console.error(`[EMPLOYEE UPDATE ERROR] Failed to process update:`, error);
    throw error;
  }
}

/**
 * Register webhooks with Paychex API
 * Should be called once to set up webhook subscriptions
 */
async function registerWebhooks() {
  try {
    console.log('[SETUP] Registering webhooks with Paychex API...');
    
    const tokenResponse = await getAccessToken(apiURL);
    const accessToken = tokenResponse.access_token;
    const companyId = await getCompanyId(accessToken);

    // Domains we want to subscribe to
    const domainsToSubscribe = [
      'WRKR_EMPL',  // Employee creation/updates
      'WRKR_TAX',   // Tax status changes
      'WRKR_CMP',   // Compensation changes
      'WRKR_ASGN',  // Assignment changes
      'WRKR_ADD',   // Address changes
      'WRKR_DEM'    // Demographic changes
    ];

    // Register webhook for each domain
    for (const domain of domainsToSubscribe) {
      try {
        console.log(`[SETUP] Registering webhook for domain: ${domain}`);
        
        const webhookConfig = {
          uri: WEBHOOK_URL,
          companyId: companyId,
          authentication: {
            type: 'NO_AUTH'  // Or configure appropriate auth based on your setup
          },
          domains: [domain]
        };

        const result = await addWebhook(
          webhookConfig.uri,
          webhookConfig.companyId,
          webhookConfig.authentication,
          webhookConfig.domains
        );

        console.log(`[SETUP] Webhook registered for ${domain}:`, result);
      } catch (error) {
        console.error(`[SETUP ERROR] Failed to register webhook for domain ${domain}:`, error);
      }
    }

    console.log('[SETUP] Webhook registration complete');
  } catch (error) {
    console.error('[SETUP ERROR] Failed to register webhooks:', error);
    throw error;
  }
}

/**
 * Get all registered webhooks
 */
async function listRegisteredWebhooks() {
  try {
    console.log('[INFO] Fetching registered webhooks...');
    
    const tokenResponse = await getAccessToken(apiURL);
    const accessToken = tokenResponse.access_token;

    const webhooks = await getWebhooks();
    console.log('[INFO] Registered webhooks:', JSON.stringify(webhooks, null, 2));
    
    return webhooks;
  } catch (error) {
    console.error('[ERROR] Failed to fetch webhooks:', error);
    throw error;
  }
}

/**
 * Start the webhook server
 */
function startWebhookServer() {
  webhookServer.listen(WEBHOOK_PORT, () => {
    console.log(`
╔════════════════════════════════════════════════════════╗
║          Paychex Webhook Server Started                ║
╠════════════════════════════════════════════════════════╣
║ Listening on:    http://localhost:${WEBHOOK_PORT}              ║
║ Webhook URL:     ${WEBHOOK_URL}                         ║
║ Health Check:    http://localhost:${WEBHOOK_PORT}/health       ║
║ Test Endpoint:   http://localhost:${WEBHOOK_PORT}/test         ║
╚════════════════════════════════════════════════════════╝
    `);
    console.log('[INFO] Webhook server ready to receive events from Paychex API');
  });
}

/**
 * Test the webhook with a sample payload
 */
function testWebhook() {
  console.log('[TEST] Sending test webhook payload...');
  
  const samplePayload = {
    domain: 'WRKR_EMPL',
    eventId: 'test-event-' + Date.now(),
    timestamp: new Date().toISOString(),
    data: {
      workerId: 'TEST-WORKER-001',
      givenName: 'John',
      familyName: 'Doe',
      status: 'ACTIVE'
    }
  };

  const options = {
    hostname: 'localhost',
    port: WEBHOOK_PORT,
    path: '/webhook',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(JSON.stringify(samplePayload))
    }
  };

  const req = http.request(options, (res) => {
    let responseData = '';

    res.on('data', chunk => {
      responseData += chunk;
    });

    res.on('end', () => {
      console.log('[TEST] Response:', responseData);
    });
  });

  req.on('error', error => {
    console.error('[TEST ERROR]', error);
  });

  req.write(JSON.stringify(samplePayload));
  req.end();
}

// Export functions for use in other modules
module.exports = {
  registerWebhooks,
  listRegisteredWebhooks,
  startWebhookServer,
  testWebhook,
  processWebhookEvent,
  handleNewEmployee,
  handleStatusChange,
  handleEmployeeUpdate
};

// Run server if this file is executed directly
if (require.main === module) {
  const command = process.argv[2];

  if (command === 'register') {
    registerWebhooks()
      .then(() => {
        console.log('[SETUP] Webhooks registered successfully');
        process.exit(0);
      })
      .catch(error => {
        console.error('[SETUP FAILED]', error);
        process.exit(1);
      });
  } else if (command === 'list') {
    listRegisteredWebhooks()
      .then(() => {
        process.exit(0);
      })
      .catch(error => {
        console.error('[LIST FAILED]', error);
        process.exit(1);
      });
  } else if (command === 'test') {
    startWebhookServer();
    setTimeout(() => {
      testWebhook();
      setTimeout(() => {
        process.exit(0);
      }, 2000);
    }, 1000);
  } else {
    // Default: start the server
    startWebhookServer();
  }
}
