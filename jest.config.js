/*
 * For a detailed explanation regarding each configuration property, visit:
 * https://jestjs.io/docs/configuration
 */

const buildName = "jest-browserstack Dt - " + Date.now();

const username = process.env.BROWSERSTACK_USERNAME || "", accessKey = process.env.BROWSERSTACK_ACCESS_KEY || "";

module.exports = {
	coverageProvider: "v8",
	globals: {
		CAPABILITIES: [{
				os: "Windows",
				os_version: "10",
				browserName: "Chrome",
				browser_version: "latest",
				project: "BStack Demo",
				build: buildName,
				"browserstack.user": username,
				"browserstack.key": accessKey,
			},
			{
				os: "Windows",
				os_version: "10",
				browserName: "Chrome",
				browser_version: "latest-1",
				project: "BStack Demo",
				build: buildName,
				"browserstack.user": username,
				"browserstack.key": accessKey,
			},
			{
				os: "OS X",
				os_version: "Big Sur",
				browserName: "Safari",
				browser_version: "latest",
				project: "BStack Demo",
				build: buildName,
				"browserstack.user": username,
				"browserstack.key": accessKey,
			},
			{
				os: "OS X",
				os_version: "Big Sur",
				browserName: "Firefox",
				browser_version: "latest",
				project: "BStack Demo",
				build: buildName,
				"browserstack.user": username,
				"browserstack.key": accessKey,
			},
			{
				device: "Google Pixel 6",
				browserName: "Chrome",
				realMobile: true,
				project: "BStack Demo",
				build: buildName,
				"browserstack.user": username,
				"browserstack.key": accessKey,
			},
		],
	},
	maxConcurrency: 5,
	maxWorkers: 5,
	roots: ["src"],
	testMatch: ["**/*.test.js"],
	testPathIgnorePatterns: ["/node_modules/"],
};