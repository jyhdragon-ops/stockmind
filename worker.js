// StockMind — Cloudflare Workers 프록시
// KIS API CORS 우회 + 토큰 발급 중계

export default {
  async fetch(request) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': 'https://jyhdragon-ops.github.io',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    };

    // OPTIONS preflight — 커스텀 헤더(x-appkey 등) 사용 시 브라우저가 먼저 보냄
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url        = new URL(request.url);
    const path       = url.pathname;
    const appkey     = request.headers.get('x-appkey');
    const appsecret  = request.headers.get('x-appsecret');
    const token      = request.headers.get('x-token');
    const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };

    try {
      // ── 토큰 발급 ── POST /token
      if (path === '/token') {
        const res = await fetch('https://openapi.koreainvestment.com:9443/oauth2/tokenP', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ grant_type: 'client_credentials', appkey, appsecret }),
        });
        const data = await res.json();
        return new Response(JSON.stringify(data), { headers: jsonHeaders });
      }

      // ── 현재가 조회 ── GET /price/{market}/{ticker}
      // market: J=코스피, Q=코스닥
      if (path.startsWith('/price/')) {
        const [, , market, ticker] = path.split('/');
        const res = await fetch(
          `https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-price` +
          `?FID_COND_MRKT_DIV_CODE=${market}&FID_INPUT_ISCD=${ticker}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              appkey,
              appsecret,
              tr_id: 'FHKST01010100',
              custtype: 'P',
            },
          }
        );
        const data = await res.json();
        return new Response(JSON.stringify(data), { headers: jsonHeaders });
      }

      // ── 일별 차트 조회 ── GET /chart/{market}/{ticker}/{period}
      // period: D=일봉, W=주봉, M=월봉
      // MA120 계산용 약 180 캘린더일(~130 거래일) 확보
      // inquire-daily-itemchartprice (FHKST03010100) — 날짜 범위 지원 + output2 반환
      if (path.startsWith('/chart/')) {
        const [, , market, ticker, period] = path.split('/');
        const toDate   = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const fromDate = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000)
                           .toISOString().slice(0, 10).replace(/-/g, '');
        const res = await fetch(
          `https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice` +
          `?FID_COND_MRKT_DIV_CODE=${market}&FID_INPUT_ISCD=${ticker}` +
          `&FID_INPUT_DATE_1=${fromDate}&FID_INPUT_DATE_2=${toDate}` +
          `&FID_PERIOD_DIV_CODE=${period}&FID_ORG_ADJ_PRC=0`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              appkey,
              appsecret,
              tr_id: 'FHKST03010100',
              custtype: 'P',
            },
          }
        );
        const data = await res.json();
        return new Response(JSON.stringify(data), { headers: jsonHeaders });
      }

      return new Response('Not Found', { status: 404, headers: corsHeaders });

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: jsonHeaders,
      });
    }
  },
};
