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
      res.on('end', () => {
        try { resolve({ statusCode: res.statusCode, body: JSON.parse(body) }); }
        catch(e) { resolve({ statusCode: res.statusCode, body: {} }); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

exports.handler = async function(event) {
  const NOTION_TOKEN = process.env.NOTION_TOKEN;
  const DB_REVENUS  = '303892c600e6813894a1caa73b8d428a';
  const DB_DEPENSES = '303892c600e681a18695ee895b5edc99';
  const ID_SG       = '303892c600e68196bb13d295cf5a52c5';

  if (!NOTION_TOKEN) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ message: 'NOTION_TOKEN manquant' })
    };
  }

  let requestBody = {};
  try { requestBody = JSON.parse(event.body || '{}'); } catch(e) {}

  const { dateStart, dateEnd } = requestBody;
  if (!dateStart || !dateEnd) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ message: 'dateStart et dateEnd sont requis' })
    };
  }

  // Filtre revenus — propriété "Comptes" (avec s)
  const filterRevenus = {
    and: [
      { property: 'Date', date: { on_or_after: dateStart } },
      { property: 'Date', date: { before: dateEnd } },
      { property: 'Comptes', select: { equals: 'SG' } }
    ]
  };

  // Dépenses — "Compte" est une Relation → on filtre par l'ID de la page SG
  const filterDepenses = {
    and: [
      { property: 'Date', date: { on_or_after: dateStart } },
      { property: 'Date', date: { before: dateEnd } },
      { property: 'Compte', relation: { contains: ID_SG } }
    ]
  };

  try {
    let revenus = [];
    let cursor = null;
    do {
      const body = { page_size: 100, filter: filterRevenus };
      if (cursor) body.start_cursor = cursor;
      const res = await queryDatabase(DB_REVENUS, NOTION_TOKEN, body);
      if (res.statusCode !== 200) throw new Error(`Revenus: ${JSON.stringify(res.body)}`);
      revenus = revenus.concat(res.body.results || []);
      cursor = res.body.has_more ? res.body.next_cursor : null;
    } while (cursor);

    let depenses = [];
    cursor = null;
    do {
      const body = { page_size: 100, filter: filterDepenses };
      if (cursor) body.start_cursor = cursor;
      const res = await queryDatabase(DB_DEPENSES, NOTION_TOKEN, body);
      if (res.statusCode !== 200) throw new Error(`Dépenses: ${JSON.stringify(res.body)}`);
      depenses = depenses.concat(res.body.results || []);
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
