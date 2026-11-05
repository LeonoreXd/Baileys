'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.executeWMexQuery = void 0;
exports.wMexQuery = void 0;
const { Boom } = require('@hapi/boom');
const WeaBineri = require('../WABinary');
const wMexQuery = (variables, queryId, query, generateMessageTag) => {
    return query({
        tag: 'iq',
        attrs: {
            id: generateMessageTag(),
            type: 'get',
            to: WeaBineri.S_WHATSAPP_NET,
            xmlns: 'w:mex'
        },
        content: [
            {
                tag: 'query',
                attrs: { query_id: queryId },
                content: Buffer.from(JSON.stringify({ variables }), 'utf-8')
            }
        ]
    });
};
exports.wMexQuery = wMexQuery;
const executeWMexQuery = async (variables, queryId, dataPath, query, generateMessageTag) => {
    const result = await wMexQuery(variables, queryId, query, generateMessageTag);
    const child = WeaBineri.getBinaryNodeChild(result, 'result');
    if (child?.content) {
        const str = child.content.toString('utf-8').replace(/^\x00+/, '').trim();
        let data;
        try {
            data = JSON.parse(str);
        }
        catch {
            data = str;
        }
        if (typeof data === 'string') {
            return data;
        }
        if (data.errors && data.errors.length > 0) {
            const errorMessages = data.errors.map(err => err.message || 'Unknown error').join(', ');
            const firstError = data.errors[0];
            const errorCode = firstError.extensions?.error_code || 400;
            throw new Boom(`GraphQL server error: ${errorMessages}`, { statusCode: errorCode, data: firstError });
        }
        const response = dataPath ? data?.data?.[dataPath] : data?.data;
        if (typeof response !== 'undefined') {
            return response;
        }
    }
    const action = (dataPath || '').startsWith('xwa2_')
        ? dataPath.substring(5).replace(/_/g, '')
        : dataPath?.replace(/_/g, '');
    throw new Boom(`Failed to ${action}, unexpected response structure.`, { statusCode: 400, data: result });
};
exports.executeWMexQuery = executeWMexQuery;
