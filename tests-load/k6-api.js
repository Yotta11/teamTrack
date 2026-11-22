// Test de charge (section 5 : 200 utilisateurs simultanés, 95 % des requêtes < 500 ms)
// Usage : k6 run -e BASE_URL=https://preprod.teamtrack.app tests-load/k6-api.js
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE = __ENV.BASE_URL || 'http://localhost:8080';
const USERS = ['samuel.ndjock@teamtrack.app', 'nadia.kamdem@teamtrack.app', 'kevin.mballa@teamtrack.app', 'grace.ngobassa@teamtrack.app'];

export const options = {
  stages: [
    { duration: '1m', target: 50 },
    { duration: '3m', target: 200 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

export function setup() {
  return USERS.map((email) => {
    const res = http.post(`${BASE}/api/auth/login`, JSON.stringify({ email, password: 'TeamTrack@2026' }), { headers: { 'Content-Type': 'application/json' } });
    return res.json('accessToken');
  });
}

export default function (tokens) {
  const headers = { Authorization: `Bearer ${tokens[__VU % tokens.length]}` };
  for (const path of ['/api/dashboard/me', '/api/tasks?mine=true', '/api/notifications', '/api/issues']) {
    const res = http.get(`${BASE}${path}`, { headers });
    check(res, { [`${path} 200`]: (r) => r.status === 200 });
  }
  sleep(1);
}
