require('dotenv').config();

module.exports = {
  db: {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE
  },
  jira: {
    baseUrl: process.env.JIRA_BASE_URL,
    username: process.env.JIRA_USERNAME,
    apiToken: process.env.JIRA_API_TOKEN,
    projectKeys: process.env.PROJECT_KEY.split(',')
  }
};
