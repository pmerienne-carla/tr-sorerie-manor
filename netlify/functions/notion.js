const https = require('https');

function queryDatabase(databaseId, token, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const options = {
      hostname: 'api.notion.com',
      path: `/v1/databases/${databaseId}/query`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };
    const req = https.request(options, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, body: JSON.parse(body) }));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

exports.handler = async function(event) {
  const NOTION_TOKEN = process.env.NOTION_TOKEN;
  const DB_REVENUS   = '303892c600e6812e881efea7118d1354';
  const DB_DEPENSES  = '303892c600e6810c9143c9e5394af56e';

  if (!NOTION_TOKEN) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ message: 'NOTION_TOKEN manquant' })
    };
  }

  const { dateStart, dateEnd } = JSON.parse(event.body || '{}');

  const filter = {
    and: [
      { property: 'Date', date: { on_or_after: dateStart } },
      { property: 'Date', date: { before: dateEnd } }
    ]
  };

  try {
    let revenus = [];
    let cursor = null;
    do {
      const body = { page_size: 100, filter };
      if (cursor) body.start_cursor = cursor;
      const res = await queryDatabase(DB_REVENUS, NOTION_TOKEN, body);
      if (res.statusCode !== 200) throw new Error(`Revenus API error: ${JSON.stringify(res.body)}`);
      revenus = revenus.concat(res.body.results);
      cursor = res.body.has_more ? res.body.next_cursor : null;
    } while (cursor);

    let depenses = [];
    cursor = null;
    do {
      const body = { page_size: 100, filter };
      if (cursor) body.start_cursor = cursor;
      const res = await queryDatabase(DB_DEPENSES, NOTION_TOKEN, body);
      if (res.statusCode !== 200) throw new Error(`Dépenses API error: ${JSON.stringify(res.body)}`);
      depenses = depenses.concat(res.body.results);
      cursor = res.body.has_more ? res.body.next_cursor : null;
    } while (cursor);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: JSON.stringify({ revenus, depenses })
    };
  } catch(e) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ message: e.message })
    };
  }
};
