const axios = require('axios');
const config = require('../config/config');

const jiraApi = axios.create({
  baseURL: config.jira.baseUrl,
  auth: {
    username: config.jira.username,
    password: config.jira.apiToken
  }
});

module.exports = jiraApi;
