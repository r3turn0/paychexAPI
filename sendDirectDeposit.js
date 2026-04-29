const http = require('http');
const url = require('url');
const path = require('path');
const fs = require('fs');
require('dotenv').config();
/*
  Paychex automation script

  Purpose
  - Read a CSV file of employee/direct-deposit rows (dd.csv) and post direct-deposit
    updates to the Paychex API for matching workers.

  Important notes / assumptions
  - This file is the original automation script. It contains several areas that
    need hardening before production (see README.md). This file preserves the
    author's original control flow and should be refactored for robustness.
  - The script expects a local file `dd.csv` in the same directory. Each row is
    treated as one employee record. The parsing is naive (split on newlines) and
    does not handle CSV quoting or commas in fields.
  - Authentication (OAuth) call is made to the token URL below; client
    credentials are expected to be inserted where indicated or provided by
    environment/secret management in a refactor.

  CSV format (expected fields, example header):
    firstName,lastName,workerId,startDate,paymentType,accountType,value,routingNumber,accountNumber,priority

  Integration: Power Automate / OneDrive
  - Use a Power Automate flow with trigger "When a file is created" (OneDrive for Business),
    then either:
      * Send the file contents to a hosted endpoint that runs this script, or
      * Drop the file into a location where this script runs and is scheduled to poll.

  See README.md for detailed usage, risks, and recommended refactors.

*/

const apiURL = new url.URL('https://api.paychex.com/auth/oauth/v2/token');
async function getAccessToken(url) {
  try {
    // NOTE: original code wrapped async/await in an extra Promise. It returns
    // the token response JSON. In practice, you should use URLSearchParams to
    // encode x-www-form-urlencoded body and supply client credentials from
    // environment variables or a secure store instead of inlining here.
    return new Promise(async (resolve, reject) => { 
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: JSON.stringify([{ 
            grant_type: process.env.GRANT_TYPE,
            client_id: process.env.CLIENT_ID,
            client_secret: process.env.CLIENT_SECRET,
            scope: process.env.SCOPE
          }])
      });
      if(response) {
        resolve(response.json());
      }
      else {
        reject('Error retrieving access token', response);
      }
    });
  }
  catch(error) {
    console.log('Error connecting to Paychex API:', error);
  }
}
async function getCompanies(accessToken) {
  const legalName = 'Acacia Home Health Services';
  try {
    return new Promise(async (resolve, reject) => {
      const companies = await fetch('https://api.paychex.com/companies', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/vnd.paychex.companies.v1+json'
          }
        });
      const companyId = await companies.json().then(data => data.find(company => company.legalName === legalName).id);
      if(companyId)  {
        resolve(companyId);
      }
      else {
        reject('Error retrieving company ID', companyId);
      }
    });   
  }
  catch(error) {
    console.log('Error retrieving company ID:', error);
  }
}
async function getCompany(companyId, accessToken) {
  try {
    return new Promise(async (resolve, reject) => {
      const company = await fetch(`https://api.paychex.com/companies/${companyId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/vnd.paychex.companies.v1+json'
          }
      });
      const c = await company.json();
      if(c)  {
        resolve(c);
      }
      else {
        reject('Error retrieving company data', c);
      }
    });   
  }
  catch(error) {
    console.log('Error retrieving company data:', error);
  }
}
async function getWorker(cid, workerId, accessToken) {
  try {
    return new Promise(async (resolve, reject) => { 
      const worker = await fetch(`https://api.paychex.com/companies/${cid}/workers/${workerId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/vnd.paychex.companies.v1+json'
        }
      });
      // `workers` is the fetch Response object. The original script resolves
      // with the response; callers must call .json() on it. Consider returning
      // the parsed JSON directly to simplify callers.
      if(worker) {
        resolve(worker.json());
      }
      else {
        reject('Error retrieving worker', worker);
      }
    });
  }
  catch(error) {
    console.log('Error retrieving worker:', error);
  }
}
async function sendCompanyJob(employee) {
  try {
    return new Promise(async (resolve, reject) => {
      const companyJobResponse = await fetch(`https://api.paychex.com/workers/${employee.workerId}/companyjobs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: JSON.stringify([{
          jobsCorrelationId: employee.jobsCorrelationId,
          jobName: employee.jobName,
          startDate: employee.startDate,
          endDate: employee.endDate
        }])
      });
      if(companyJobResponse) {
        resolve(companyJobResponse.json());
      }
      else {
        reject('Error posting company job', companyJobResponse);  
      }
    });
  }
  catch(errore) {
    console.log('Error posting company job in sendCompanyJob', error);
  }
}
async function sendWorkerPayRate(employee, accessToken) {
  try {
    return new Promise(async (resolve, reject) => {
      const workerPayRateResponse = await fetch(`https://api.paychex.com/workers/${employee.workerId}/compensation/payrates`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: JSON.stringify([{
          "startDate": employee.startDate,
          "rateType": employee.rateType,
          "amount": employee.amount
        }])
      });
      if(workerPayRateResponse) {
        resolve(workerPayRateResponse.json());
      }
      else {
        reject('Error retrieving access token', workerPayRateResponse);
      }
    });
  }
  catch(error) {
    console.log('Error sending worker pay rate', error);
  }
}
async function sendWorkerDocument(employee, accessToken, file) {
  const base64 = Buffer.from(file.data).toString('base64');
  try {
    return new Promise(async (resolve, reject) => {
      const workerDocumentResponse = await fetch(`https://api.paychex.com/workers/${employee.workerId}/workerdocuments`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`, 
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: JSON.stringify([{
          workerId: employee.workerId,
          file: base64,
          metadata: {
            "name": file.name,
            "category": file.category
          }
        }])
      });
      if(workerDocumentResponse) {
        resolve(workerDocumentResponse.json());
      }
      else {
        reject('Error retrieving access token', workerDocumentResponse);
      }
    });
  }
  catch(e) {
    console.log('Error sending worker document', e);
  }
}
async function getWorkerDocuments(employee, accessToken) {
  try {
    return new Promise(async (resolve, reject) => {
      const workerDocumentsResponse = await fetch(`https://api.paychex.com/workers/${employee.workerId}/workerdocuments`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/vnd.paychex.companies.v1+json'
        }
      });
      if(workerDocumentsResponse) {
        resolve(workerDocumentsResponse.json());
      }
      else {
        reject('Error retrieving worker documents', workerDocumentsResponse);
      }
    });
  }
  catch(e) {
    console.log('Error retrieving worker documents', e);
  }
}

async function sendDirectDeposit(employee, accessToken) {
  try {
    return new Promise(async (resolve, reject) => { 
    const ddResponse = await fetch(`https://api.paychex.com/workers/${employee.workerId}/directdeposits`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: JSON.stringify([{ 
          startDate: employee.startDate,
          paymentType: employee.paymentType,
          accountType: employee.accountType,
          value: employee.value,
          routingNumber: employee.routingNumber,
          accountNumber: employee.accountNumber,
          priority: employee.priority
        }])
      });
      if(ddResponse) {
        resolve(ddResponse.json());
      }
      else {
        reject('Error retrieving access token', ddResponse);
      }
    });
  }
  catch(error) {
    console.log('Error on posting direct deposit for employee:', employee.workerId, error);
  }
}
async function sendFederalTax(employee, accessToken) {
  try {
    return new Promise(async (resolve, reject) => { 
    const federalTaxResponse = await fetch(`https://api.paychex.com/workers/${employee.workerId}/federaltax`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: JSON.stringify([{ 
          filingStatus: employee.filingStatus,
          multipleJobs: employee.multipleJobs,
          dependentAmount: employee.dependentAmount,
          otherIncome: employee.otherIncome,
          deductionsAmount: employee.deductionsAmount,
          taxesWithheld: employee.taxesWithheld,
          extraWitholdingAmount: employee.extraWitholdingAmount,
          overrideWithholdingAmount: employee.overrideWithholdingAmount,
          extraWithholdingPercentage: employee.extraWithholdingPercentage,
          overrideWithholdingPercentage: employee.overrideWithholdingPercentage
        }])
      });
      if(federalTaxResponse) {
        resolve(federalTaxResponse.json());
      }
      else {
        reject('Error retrieving access token', federalTaxResponse);
      }
    });
  }
  catch(error) {
    console.log('Error on posting federal tax for employee:', employee.workerId, error);
  }
}
async function sendStateTax(employee, accessToken) {
  try {
    return new Promise(async (resolve, reject) => { 
    const stateTaxResponse = await fetch(`https://api.paychex.com/workers/${employee.workerId}/statetaxes`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: JSON.stringify([{ 
          countrySubdivisionCode: employee.countrySubdivisionCode,
          stateAllocationPercent: employee.stateAllocationPercent,
          isResidentState: employee.isResidentState,
          taxStatusType: employee.taxStatusType,
          filingStatusType: employee.filingStatusType,
          additionalAmount: employee.additionalAmount,
          additionalPercent: employee.additionalPercent,
          flatDollarOverride: employee.flatDollarOverride,
          overridePercent: employee.overridePercent
        }])
      });
      if(stateTaxResponse) {
        resolve(stateTaxResponse.json());
      }
      else {
        reject('Error posting state tax for employee:', employee.workerId, stateTaxResponse);
      }
    });
  }
  catch(error) {
    console.log('Error on posting state tax for employee in sendStateTax:', employee.workerId, error);
  }
}
async function getWorkerStatus(employee, accessToken) {
  try {
    return new Promise(async (resolve, reject) => { 
    const workerStatusResponse = await fetch(`https://api.paychex.com/workers/${employee.workerId}/status`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.paychex.companies.v1+json'
      },
    });
      if(workerStatusResponse) {
        resolve(workerStatusResponse.json());
      }
      else {
        reject('Error retrieving worker status for employee:', employee.workerId, workerStatusResponse);
      }
    });
  }
  catch(error) {
    console.log('Error on retrieving worker status for employee in getWorkerStatus:', employee.workerId, error);
  }
}
async function getManagementDomains() {
  try {
    return new Promise(async (resolve, reject) => { 
    const managementDomainsResponse = await fetch(`https://api.paychex.com/management/domains`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.paychex.companies.v1+json'
      },
    });
      if(managementDomainsResponse) {
        resolve(managementDomainsResponse.json());
      }
      else {
        reject('Error retrieving management domains:', managementDomainsResponse);
      }
    });
  }
  catch(error) {
    console.log('Error on retrieving management domains in managementDomainsResponse:', error);
  }
}
async function getWebhooks(accessToken) {
  try {
    return new Promise(async (resolve, reject) => { 
    const getWebhooksResponse = await fetch(`https://api.paychex.com/management/hooks`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.paychex.companies.v1+json'
      },
    });
      if(getWebhooksResponse) {
        resolve(getWebhooksResponse.json());
      }
      else {
        reject('Error retrieving webhooks:', getWebhooksResponse);
      }
    });
  }
  catch(error) {
    console.log('Error on retrieving webhooks getWebhooksResponse:', error);
  }
}
async function getWebhook(webhookId) {
  try {
    return new Promise(async (resolve, reject) => { 
    const getWebhookResponse = await fetch(`https://api.paychex.com/management/hooks/webhookId`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.paychex.companies.v1+json'
      },
    });
      if(getWebhookResponse) {
        resolve(getWebhookResponse.json());
      }
      else {
        reject('Error retrieving webhook with webhookId:', getWebhookResponse, webhookId);
      }
    });
  }
  catch(error) {
    console.log('Error on retrieving webhook getWebhookResponse:', error);
  }
}
// uri: string, companyId: string, 
// authentication: 
// NO_AUTH doesn't have any other fields in authentication object
// * BASIC_AUTH needs 2 fields: username and password
// * APIKEY requires the field: apiKey
// * OAUTH2 requires 5 fields: tokenUrl, clientId, clientSecret, grantType, contentType
// * OAUTH2_BASIC requires 5 fields: tokenUrl, clientId, clientSecret, grantType, contentType
// domains: ["WRKR_TAX","CLT_ORG","WRKR_EMPL","CLT_PYRN","WRKR_ASGN","WRKR_DEM","WRKR_CMP","WRKR_ADD","CLT_DEM","PAY_PERIOD"]
async function addWebhook(uri, companyId, authentication, domains, accessToken) {
  try {
    return new Promise(async (resolve, reject) => { 
    const getWebhookResponse = await fetch(`https://api.paychex.com/management/hooks/webhookId`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: JSON.stringify([{ 
          uri: uri,
          companyId: companyId,
          authentication: authentication,
          domains: domains
        }])
    });
      if(getWebhookResponse) {
        resolve(getWebhookResponse.json());
      }
      else {
        reject('Error retrieving webhook with webhookId:', getWebhookResponse, webhookId);
      }
    });
  }
  catch(error) {
    console.log('Error on retrieving webhook getWebhookResponse:', error);
  }
}
async function main() {
  const token = await getAccessToken(apiURL);
  const cid = await getCompanyId(token.access_token);
}

// Execute the main function
main();

// Export functions for use in webhook.js and other modules
module.exports = {
  getAccessToken,
  getCompanyId,
  getWorkers,
  sendCompanyJob,
  sendWorkerPayRate,
  sendWorkerDocument,
  sendDirectDeposit,
  sendFederalTax,
  sendStateTax,
  getWorkerStatus,
  getManagementDomains,
  getWebhooks,
  getWebhook,
  addWebhook
};