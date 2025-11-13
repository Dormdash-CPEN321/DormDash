import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { studentTokens, moverTokens } from './tokens.js';

const errorRate = new Rate('errors');
const postOrderLatency = new Trend('post_order_latency');
const getAvailableJobsLatency = new Trend('get_available_jobs_latency');

// test config
export const options = {
  stages: [
    // gradually increase load over 2 minutes
    { duration: '30s', target: 50 }, // ramp to 50 users in 1 seconds
    { duration: '30s', target: 120 }, // Ramp to 120 users in another 30 seconds
    { duration: '2m', target: 200 }, // hold at 200 users for 2 minutes
    // gradually decrease load over 1 minute
    { duration: '30s', target: 100 }, 
    { duration: '30s', target: 0 }, 
  ],
  thresholds: {
    // 90th percentile latency must be below 20s for each endpoint
    'http_req_duration{name:POST /api/order}': ['p(90)<20000'],
    'http_req_duration{name:GET /api/jobs/available}': ['p(90)<20000'],
    // overall error rate must be below 1%
    errors: ['rate<0.01'],
    // HTTP errors should be less than 1%
    'http_req_failed': ['rate<0.01'],
    // check if 90% of requests complete within 20s
    'http_req_duration': ['p(90)<20000'],
  },
};


const BASE_URL = "http://ec2-44-254-94-195.us-west-2.compute.amazonaws.com"


const WAREHOUSES = [
  {
    lat: 49.2827,
    lon: -123.1207,
    formattedAddress: '2457 Kingsway, Vancouver, BC',
  },
  {
    lat: 49.25,
    lon: -123.1,
    formattedAddress: '456 West St, Vancouver, BC',
  },
];

function generateObjectId() {
  const timestamp = Math.floor(new Date().getTime() / 1000).toString(16);
  const objectId =
    timestamp +
    'xxxxxxxxxxxxxxxx'
      .replace(/[x]/g, () => {
        return Math.floor(Math.random() * 16).toString(16);
      })
      .toLowerCase();
  return objectId.padEnd(24, '0');
}

function generateAddress() {
  const baseLat = 49.2827;
  const baseLon = -123.1207;

  return {
    lat: baseLat + (Math.random() - 0.5) * 0.1, 
    lon: baseLon + (Math.random() - 0.5) * 0.1,
    formattedAddress: `${Math.floor(Math.random() * 1000)} Test Street, Vancouver, BC`,
  };
}

function getRandomWarehouse() {
  return WAREHOUSES[Math.floor(Math.random() * WAREHOUSES.length)];
}

function getRandomStudentToken() {
  return studentTokens[Math.floor(Math.random() * studentTokens.length)];
}

function getRandomMoverToken() {
  return moverTokens[Math.floor(Math.random() * moverTokens.length)];
}

// generate random order data
function generateOrderData() {
  const now = new Date();
  const pickupTime = new Date(
    now.getTime() + Math.random() * 3 * 24 * 60 * 60 * 1000
  ); // Random time in next 3 days
  const returnTime = new Date(
    pickupTime.getTime() + (7 + Math.random() * 30) * 24 * 60 * 60 * 1000
  ); // 7-37 days after pickup

  const volume = Math.floor(Math.random() * 50) + 1; // 1-50 cubic feet
  const basePrice = volume * 5; // Base price calculation
  const totalPrice = basePrice + Math.floor(Math.random() * 100) + 10; // $10-$110 additional

  const studentAddress = generateAddress();
  const warehouseAddress = getRandomWarehouse();

  return {
    studentId: generateObjectId(),
    volume: volume,
    totalPrice: totalPrice,
    studentAddress: studentAddress,
    warehouseAddress: warehouseAddress,
    pickupTime: pickupTime.toISOString(),
    returnTime: returnTime.toISOString(),
    returnAddress: Math.random() > 0.5 ? generateAddress() : undefined, // 50% chance of custom return address
    paymentIntentId:
      Math.random() > 0.3 ? `pi_test_${generateObjectId()}` : undefined, // 70% chance of payment intent
  };
}

export default function () {
  const random = Math.random();

  if (random < 0.7) {
    // 70% of requests: POST /api/order
    const orderData = generateOrderData();
    const studentToken = getRandomStudentToken();
    const postResponse = http.post(
      `${BASE_URL}/api/order`,
      JSON.stringify(orderData),
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${studentToken}`,
        },
        tags: { name: 'POST /api/order' },
      }
    );

    const postSuccess = check(postResponse, {
      'POST /api/order status is 201': (r) => r.status === 201,
      'POST /api/order has response body': (r) => r.body.length > 0,
      'POST /api/order returns valid order': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.id !== undefined || body._id !== undefined;
        } catch {
          return false;
        }
      },
    });

    errorRate.add(!postSuccess);
    postOrderLatency.add(postResponse.timings.duration);

    if (!postSuccess) {
      console.error(
        `POST /api/order failed: ${postResponse.status} - ${postResponse.body}`
      );
    }
  } else {
    // 30% of requests: GET /api/jobs/available
    const moverToken = getRandomMoverToken();
    const getResponse = http.get(`${BASE_URL}/api/jobs/available`, {
      headers: {
        Authorization: `Bearer ${moverToken}`,
      },
      tags: { name: 'GET /api/jobs/available' },
    });

    const getSuccess = check(getResponse, {
      'GET /api/jobs/available status is 200': (r) => r.status === 200,
      'GET /api/jobs/available has response body': (r) => r.body.length > 0,
    });

    errorRate.add(!getSuccess);
    getAvailableJobsLatency.add(getResponse.timings.duration);

    if (!getSuccess) {
      console.error(
        `GET /api/jobs/available failed: ${getResponse.status} - ${getResponse.body}`
      );
    }
  }

  // 0.5-2.5 seconds between requests to simulate user think time
  sleep(Math.random() * 2 + 0.5); 
}

// summary function to output custom metrics
export function handleSummary(data) {
  return {
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}

// text summary
// text summary (scalability-focused)
function textSummary(data, options = {}) {
  const indent = options.indent || '  ';
  let summary = '\n' + '='.repeat(60) + '\n';
  summary += 'LOAD TEST SUMMARY - SCALABILITY TEST\n';
  summary += '='.repeat(60) + '\n\n';

  // Overall system stability
  const totalRequests = data.metrics.http_reqs?.values.count || 0;
  const failedRequests = data.metrics.http_req_failed?.values.rate
    ? data.metrics.http_req_failed.values.rate * 100
    : 0;
  const avgResponse = data.metrics.http_req_duration?.values.avg || 0;
  const p90Latency = data.metrics.http_req_duration?.values['p(90)'] || 0;
  const rps = data.metrics.http_reqs?.values.rate || 0;

  summary += 'Scalability Overview:\n';
  summary += `${indent}Total Requests: ${totalRequests}\n`;
  summary += `${indent}Failed Requests: ${failedRequests.toFixed(2)}%\n`;
  summary += `${indent}Average Response Time: ${avgResponse.toFixed(2)}ms\n`;
  summary += `${indent}90th Percentile Latency: ${p90Latency.toFixed(2)}ms\n`;
  summary += `${indent}Requests per Second: ${rps.toFixed(2)}\n`;

  // Threshold results
  summary += '\nThreshold Results:\n';
  summary += `${indent}Error Rate: ${failedRequests.toFixed(2)}% ${
    failedRequests < 1 ? '✓' : '✗'
  }\n`;
  summary += `${indent}90th Percentile Latency: ${p90Latency.toFixed(2)}ms ${
    p90Latency < 20000 ? '✓' : '✗'
  }\n`;

  // Scalability metrics
  summary += '\n' + '='.repeat(60) + '\n';
  summary += 'Scalability Metrics:\n';
  summary += '='.repeat(60) + '\n';
  summary += `${indent}Peak Virtual Users (VUs): ${options.vus || 'N/A'}\n`;
  summary += `${indent}Test Duration: ${options.duration || 'N/A'}\n`;
  summary += `${indent}Total Data Transferred: ${
    data.metrics.data_received?.values.count
      ? (data.metrics.data_received.values.count / 1024 / 1024).toFixed(2) + ' MB'
      : 'N/A'
  }\n`;
  summary += `${indent}Data Sent: ${
    data.metrics.data_sent?.values.count
      ? (data.metrics.data_sent.values.count / 1024 / 1024).toFixed(2) + ' MB'
      : 'N/A'
  }\n`;

  // Pass/fail checks summary
  if (data.root_group?.checks) {
    summary += '\nCheck Results:\n';
    Object.entries(data.root_group.checks).forEach(([name, check]) => {
      const total = check.passes + check.fails;
      const passRate = total > 0 ? (check.passes / total) * 100 : 0;
      summary += `${indent}${name}: ${passRate.toFixed(2)}% (${check.passes}/${total})\n`;
    });
  }

  // Dynamic final summary
  const scalabilityPassed = failedRequests < 1 && p90Latency < 20000;
  summary += '\n' + '='.repeat(60) + '\n';
  summary += 'Summary:\n';
  summary += '='.repeat(60) + '\n';
  if (scalabilityPassed) {
    summary += `${indent}✅ Scalability test completed successfully.\n`;
    summary += `${indent}System remained stable under high concurrency.\n`;
    summary += `${indent}Performance degradation observed is within acceptable range.\n`;
  } else {
    summary += `${indent}❌ Scalability test did NOT meet requirements.\n`;
    if (failedRequests >= 1) {
      summary += `${indent}- Error rate too high: ${failedRequests.toFixed(2)}%\n`;
    } else {
      summary += `${indent}- Error rate within acceptable range: ${failedRequests.toFixed(2)}%\n`;
    }
    if (p90Latency >= 20000) {
      summary += `${indent}- 90th percentile latency too high: ${p90Latency.toFixed(2)}ms\n`;
    } else {
      summary += `${indent}- 90th percentile latency within acceptable range: ${p90Latency.toFixed(2)}ms\n`;
    }
    summary += `${indent}⚠️ Consider scaling the system or optimizing endpoints.\n`;
  }
  summary += '='.repeat(60) + '\n';

  return summary;
}
