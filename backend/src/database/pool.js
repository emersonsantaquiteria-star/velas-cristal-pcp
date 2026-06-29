const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function normalizeParams(params) {
  return Array.isArray(params) ? params : [];
}

function toQueryResult(result) {
  if (Array.isArray(result)) {
    return {
      rows: result,
      rowCount: result.length
    };
  }

  return {
    rows: [],
    rowCount: Number(result || 0)
  };
}

function createQueryClient(client) {
  return {
    query: async (text, params) => {
      const normalizedText = String(text).trim();
      const shouldReturnRows =
        /^(select|with|show)\b/i.test(normalizedText) ||
        /\breturning\b/i.test(normalizedText);
      const result = shouldReturnRows
        ? await client.$queryRawUnsafe(normalizedText, ...normalizeParams(params))
        : await client.$executeRawUnsafe(normalizedText, ...normalizeParams(params));
      return toQueryResult(result);
    }
  };
}

async function withTransaction(work) {
  return prisma.$transaction(async (tx) => work(createQueryClient(tx)), {
    maxWait: 10000,
    timeout: 30000
  });
}

module.exports = {
  prisma,
  pool: {
    query: (text, params) => createQueryClient(prisma).query(text, params),
    end: () => prisma.$disconnect()
  },
  query: (text, params) => createQueryClient(prisma).query(text, params),
  withTransaction
};
