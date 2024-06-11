const axios = require('axios');
const fs = require('fs');
const path = require('path');
const config = require('../config/config');

const apiEndpoint = '/rest/api/3/search';
const jiraBaseUrl = config.jira.baseUrl;
const projectKeys = config.jira.projectKeys;
const username = config.jira.username;
const apiToken = config.jira.apiToken;

const auth = Buffer.from(`${username}:${apiToken}`).toString('base64');

// Fetch issues for a single project
const fetchIssuesForProject = async (projectKey, startAt = 0, allIssues = []) => {
  const jql = `project=${projectKey}`;
  const requestConfig = {
    method: 'get',
    url: `${jiraBaseUrl}${apiEndpoint}`,
    headers: {
      'Authorization': `Basic ${auth}`,
      'Accept': 'application/json'
    },
    params: {
      jql: jql,
      maxResults: 100,
      startAt: startAt,
      expand: 'changelog'
    }
  };

  try {
    const response = await axios(requestConfig);
    const issues = response.data.issues;
    allIssues = allIssues.concat(issues);

    if (response.data.total > allIssues.length) {
      return fetchIssuesForProject(projectKey, startAt + 100, allIssues);
    } else {
      return allIssues;
    }
  } catch (error) {
    console.error(`Error fetching issues for project ${projectKey}:`, error.toJSON());
    throw error;
  }
};

// Fetch issues for all projects
const fetchIssuesForAllProjects = async () => {
  let allProjectIssues = [];
  for (const projectKey of projectKeys) {
    console.time(`fetchIssues for project ${projectKey}`);
    const projectIssues = await fetchIssuesForProject(projectKey);
    console.timeEnd(`fetchIssues for project ${projectKey}`);
    allProjectIssues = allProjectIssues.concat(projectIssues);
  }
  return allProjectIssues;
};

const saveIssuesToFile = (issues, filename) => {
  const CHUNK_SIZE = 1000;
  fs.writeFileSync(filename, '[\n'); // Start the array
  for (let i = 0; i < issues.length; i += CHUNK_SIZE) {
    const chunk = issues.slice(i, i + CHUNK_SIZE);
    const chunkData = JSON.stringify(chunk, null, 2).slice(1, -1); // Remove the surrounding array brackets
    if (i > 0) fs.appendFileSync(filename, ',\n'); // Add a comma separator between chunks
    fs.appendFileSync(filename, chunkData, (err) => {
      if (err) {
        console.error('Error writing to file', err);
      }
    });
  }
  fs.appendFileSync(filename, '\n]');
};

const fetchAndSaveIssues = async () => {
  console.time('fetchIssuesForAllProjects');
  try {
    const issues = await fetchIssuesForAllProjects();
    const filename = path.join(__dirname, '../jiraIssues.json');
    saveIssuesToFile(issues, filename);
    console.log('File successfully written');
    console.timeEnd('fetchIssuesForAllProjects');
  } catch (error) {
    console.error('Failed to fetch issues:', error);
    console.timeEnd('fetchIssuesForAllProjects');
  }
};

module.exports = fetchAndSaveIssues;