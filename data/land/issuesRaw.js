const fs = require('fs');
const sql = require('mssql');
const path = require('path');
const config = require('../../config/config');
const { chain } = require('stream-chain');
const { parser } = require('stream-json');
const { streamArray } = require('stream-json/streamers/StreamArray');

const dbConfig = {
    user: config.db.user,
    password: config.db.password,
    server: config.db.server,
    database: config.db.database,
    port: parseInt(config.db.port, 10),
    options: {
        encrypt: true,
        enableArithAbort: true,
        trustServerCertificate: true
    }
};

const sanitizeString = (str, maxLength) => {
    if (typeof str !== 'string') return '';
    return str.replace(/[\u0000-\u001f\u007f-\u009f]/g, '').substring(0, maxLength);
};

const parseDate = (dateString) => {
    const date = new Date(dateString);
    return isNaN(date.getTime()) ? null : date;
};

const extractTextFromDescription = (desc) => {
    if (!desc || typeof desc !== 'object') return '';

    let text = '';

    const extractText = (node) => {
        if (node.type === 'text') {
            text += node.text;
        } else if (node.content && Array.isArray(node.content)) {
            node.content.forEach(extractText);
        }
    };

    if (desc.content && Array.isArray(desc.content)) {
        desc.content.forEach(extractText);
    }

    return text;
};

const insertIssuesToDb = async (pool, issue) => {
    if (!issue.fields) {
        console.error(`Issue ${issue.id} has no fields property.`);
        return;
    }

    const { id, key, fields } = issue;
    const description = sanitizeString(extractTextFromDescription(fields.description), 4000);
    await pool.request()
        .input('issue_id', sql.Int, parseInt(id, 10))
        .input('issue_key', sql.NVarChar, key)
        .input('summary', sql.NVarChar, fields.summary || '')
        .input('description', sql.NVarChar, description)
        .input('issue_type', sql.NVarChar, fields.issuetype?.name || '')
        .input('status', sql.NVarChar, fields.status?.name || '')
        .input('created', sql.DateTime, fields.created ? parseDate(fields.created) : null)
        .input('updated', sql.DateTime, fields.updated ? parseDate(fields.updated) : null)
        .input('priority', sql.NVarChar, fields.priority?.name || null)
        .input('reporter', sql.NVarChar, fields.reporter?.displayName || '')
        .input('assignee', sql.NVarChar, fields.assignee?.displayName || null)
        .input('labels', sql.NVarChar, fields.labels ? fields.labels.join(',') : null)
        .input('parent_id', sql.Int, fields.parent ? parseInt(fields.parent.id, 10) : null)
        .input('parent_key', sql.NVarChar, fields.parent?.key || null)
        .input('parent_summary', sql.NVarChar, fields.parent?.fields?.summary || null)
        .input('sprint', sql.NVarChar, fields.customfield_10020 ? fields.customfield_10020[0]?.name : null)
        .input('sprint_start_date', sql.DateTime, fields.customfield_10020 ? parseDate(fields.customfield_10020[0]?.startDate) : null)
        .input('sprint_end_date', sql.DateTime, fields.customfield_10020 ? parseDate(fields.customfield_10020[0]?.endDate) : null)
        .input('sprint_state', sql.NVarChar, fields.customfield_10020 ? fields.customfield_10020[0]?.state : null)
        .input('sprint_goal', sql.NVarChar, fields.customfield_10020 ? fields.customfield_10020[0]?.goal : null)
        .query(`INSERT INTO Jira.Issues
            (issue_id, issue_key, summary, description, issue_type, status, created, updated, priority, reporter, assignee, labels, parent_id, parent_key, parent_summary, sprint, sprint_start_date, sprint_end_date, sprint_state, sprint_goal, dwlastupdate)
            VALUES (@issue_id, @issue_key, @summary, @description, @issue_type, @status, @created, @updated, @priority, @reporter, @assignee, @labels, @parent_id, @parent_key, @parent_summary, @sprint, @sprint_start_date, @sprint_end_date, @sprint_state, @sprint_goal, GETDATE())`);
};

const insertIssueLinksToDb = async (pool, issue, linkedIssues) => {
    const issueId = await pool.request()
        .input('issue_key', sql.NVarChar, issue.key)
        .query('SELECT issue_id FROM Jira.Issues WHERE issue_key = @issue_key');
    
    if (issueId.recordset.length === 0) {
        console.log(`Issue ID for ${issue.key} does not exist in Jira.Issues table.`);
        return;
    }

    const issueIdValue = issueId.recordset[0].issue_id;

    const linkInserts = linkedIssues.map(async linkedIssue => {
        const linkedIssueId = await pool.request()
            .input('issue_key', sql.NVarChar, linkedIssue.key)
            .query('SELECT issue_id FROM Jira.Issues WHERE issue_key = @issue_key');

        if (linkedIssueId.recordset.length === 0) {
            console.log(`Linked issue ID ${linkedIssue.key} for issue ${issue.key} does not exist in Jira.Issues table.`);
            return;
        }

        const linkedIssueIdValue = linkedIssueId.recordset[0].issue_id;

        return pool.request()
            .input('issue_id', sql.Int, issueIdValue)
            .input('linked_issue_id', sql.Int, linkedIssueIdValue)
            .input('link_type', sql.NVarChar, linkedIssue.type)
            .query(`INSERT INTO Jira.IssueLinks (issue_id, linked_issue_id, link_type) 
                    VALUES (@issue_id, @linked_issue_id, @link_type)`);
    });

    await Promise.all(linkInserts);
};

const processIssues = async () => {
    try {
        const filePath = path.join(__dirname, '../../jiraIssues.json');
        const pool = await sql.connect(dbConfig);

        const pipeline = chain([
            fs.createReadStream(filePath),
            parser(),
            streamArray()
        ]);

        pipeline.on('data', async ({ value }) => {
            try {
                //console.log(`Processing issue: ${JSON.stringify(value)}`); // Log the issue for debugging
                await insertIssuesToDb(pool, value);

                const linkedIssues = value.fields.issuelinks.map(link => {
                    if (link.inwardIssue) {
                        return { key: link.inwardIssue.key, type: link.type.inward };
                    } else if (link.outwardIssue) {
                        return { key: link.outwardIssue.key, type: link.type.outward };
                    }
                }).filter(Boolean);

                await insertIssueLinksToDb(pool, value, linkedIssues);
            } catch (error) {
                console.error(`Error processing issue ${value.key}:`, error);
            }
        });

        pipeline.on('end', () => {
            console.log('Finished processing all issues and links.');
        });

        pipeline.on('error', (error) => {
            console.error('Error parsing JSON stream:', error);
        });

    } catch (error) {
        console.error('Error processing issues and links:', error);
    }
};

module.exports = processIssues;