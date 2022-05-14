import { tcDefaults } from "./defaults.js"

chrome.runtime.onInstalled.addListener(function() {
    fetchMarkData();
    // TODO check this
    fetchAndNormalizeFilterData();
})

function updateDictionary(visited) {
    return chrome.storage.local.set({ "visited": visited }).then(() => {
        if (chrome.runtime.error) {
            console.log("Runtime error.");
        }
    });
}

function saveFilters(filters) {
    return chrome.storage.local.set({ "filters": filters })
}

chrome.runtime.onStartup.addListener(function() {
    fetchMarkData();
    fetchAndNormalizeFilterData();
});

chrome.action.onClicked.addListener(async function() {
    const tab = await chrome.tabs.query({active: true, currentWindow: true})
    if (!await markedAsRead(tab[0].url)) {
        await addUrl(tab[0].url);
        await markAsVisited(tab[0].id);
    } else {
        await removeUrl(tab[0].url);
        await markAsNotVisited(tab[0].id);
    }
})

chrome.tabs.onActivated.addListener(async function callback() {
       // console.log("onActivated");

    const tabs = await chrome.tabs.query({active: true, currentWindow: true})
    // console.log(tab[0].url);
    if (!await markedAsRead(tabs[0].url)) {
        await markAsNotVisited(tabs[0].id);
    } else {
        await markAsVisited(tabs[0].id);
    }
    await changeLinkColor(tabs[0])
});

chrome.tabs.onUpdated.addListener(async function callback(activeInfo, info) {
        // console.log("onUpdated");

    const tabs = await chrome.tabs.query({active: true, currentWindow: true})
    if (!await markedAsRead(tabs[0].url)) {
        await markAsNotVisited(tabs[0].id);
    } else {
        await markAsVisited(tabs[0].id);
    }
    if (info.status === 'complete') {
        await changeLinkColor(tabs[0]);
        chrome.tabs.sendMessage(
            tabs[0].id, 
            { 
                action: "start_mutation_observer",
                tabId: tabs[0].id
            }
        )

    }
});

chrome.commands.onCommand.addListener(async function() {
    // console.log("onCommand");
    const tabs = await chrome.tabs.query({active: true, currentWindow: true})
    if (!await markedAsRead(tabs[0].url)) {
        await addUrl(tabs[0].url);
        await markAsVisited(tabs[0].id);
    } else {
        await removeUrl(tabs[0].url);
        await markAsNotVisited(tabs[0].id);
    }
})


async function fetchMarkData() {
    const obj = await chrome.storage.local.get("visited")
    if (obj["visited"] == undefined) {
        await updateDictionary({ version: 2 });
    } else {
        var objVisited = obj["visited"];
        if (objVisited.version != 2) {
            for (const url of Object.keys(objVisited)) {
                await addUrl(url)
            }
            let obj = await chrome.storage.local.get("visited")
            objVisited = obj["visited"]
            objVisited.version = 2
            await updateDictionary(objVisited)
        }
    }
    return chrome.storage.local.get("visited")
}

async function fetchAndNormalizeFilterData() {
    const obj = await chrome.storage.local.get("filters")
    if (obj["filters"] == undefined) {
        await saveFilters({});
    } 
    return chrome.storage.local.get("filters")
}

function markAsNotVisited(atabId) {
    // console.log("markAsNotVisited");
    return chrome.action.setIcon({ path: "notvisited.png", tabId: atabId });
}

function markAsVisited(atabId) {
    // console.log("markAsVisited");
    return chrome.action.setIcon({ path: "visited.png", tabId: atabId });
}

// NOTE: Don't use an async callback for an onMessage listener. sendResponse will be invalidated before it can be used.
chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
    if (msg.action === 'import-visited') {
        importVisited(msg.data)
    } else if (msg.action === 'import-filters') {
        importFilters(msg.data).then((filtersByOrigin) => sendResponse(filtersByOrigin))
    } else if (msg.action === 'process_post_load_elements') {
        processPostLoadElements(sender.tab.id, msg.links).then(sendResponse)
    }
    return true
});

async function processPostLoadElements(senderTabId, links) {
    const visited = []
    for(const link of links) {
        if (await markedAsRead(link)) {
            visited.push(link)
        }
    }
    chrome.tabs.sendMessage(senderTabId, {action: "change_link_color", links: visited, linkColor: "red"})
}

async function importVisited(data) {
    // filter/map/forEach do not support async/await, hence the usage of "for"
    const keys = Object.keys(data).filter(key => key != 'version')
    for (const key of keys) {
        for (const value of data[key]) {
            if (!await markedAsRead(key + value)) {
                await addUrl(key + value)
            }
        }
    }
}

async function importFilters(filtersByOrigin) {
    let importedFiltersByOrigin = filtersByOrigin;

    const currentFiltersByOrigin = (await fetchAndNormalizeFilterData())['filters']
    Object.keys(importedFiltersByOrigin)
            .forEach(urlOrigin =>  
                importedFiltersByOrigin[urlOrigin]
                    .filter(filter => !currentFiltersByOrigin[urlOrigin]?.includes(filter))
                    .forEach(filter => addFilter(currentFiltersByOrigin, urlOrigin, filter)))
    await saveFilters(currentFiltersByOrigin)
}

async function removeUrl(url) {
    // console.log("Remove URL")
    var key = getOrigin(url);
    // console.log(`Key ${key}`)
    const obj = await fetchMarkData()
    var path = await getFilteredPath(url)
    const visited = obj["visited"]
    const index = visited[key].indexOf(path);
    // console.log(`Index ${index}`)
    if (index > -1) {
        visited[key].splice(index, 1);
    }
    if (!visited[key].length) {
        delete visited[key];
    }
    await updateDictionary(visited)
}

async function markedAsRead(url) {
    if (url) {
        var key = getOrigin(url);
        const obj = await fetchMarkData()
        const visited = obj["visited"]
        if (visited?.[key]) {
            var path = await getFilteredPath(url)
            return visited[key].includes(path);
        }
    }
    return false
}

async function addUrl(url) {
    // console.log("Add URL")
    const key = getOrigin(url);
    // console.log(`Key ${key}`)
    const path = await getFilteredPath(url)

    // console.log(`Path ${path}`)
    const obj = await fetchMarkData()
    const visited = obj["visited"]
    if (visited[key]) {
        visited[key].push(path);
    } else {
        visited[key] = [path];
    }
    await updateDictionary(visited)
}

function addFilter(filtersByOrigin, url, filter) {
    const origin = getOrigin(url);
    if (filtersByOrigin[origin]) {
        filtersByOrigin[origin].push(filter);
    } else {
        filtersByOrigin[origin] = [filter];
    }
}

function getOrigin(url) {
    return new URL(url).origin;
}

async function getFilteredPath(url) {
    const origin = getOrigin(url)
    let path = url.replace(origin, '');

    const obj = await fetchAndNormalizeFilterData()
    const filtersByOrigin = obj["filters"]
    const filters = filtersByOrigin[origin]
    if (filters) {
        filters.forEach(filter => {
            path = path.replace(new RegExp(filter), "")
        })
    }
    return path
}

async function changeLinkColor(tab) {
	const storage = await chrome.storage.local.get(tcDefaults)
	const visitedObj = await fetchMarkData()
	const visited = visitedObj["visited"]
    if(storage.changeLinkColor) {
        if(containsSite(storage.sites, tab.url)) {
            // Retrieves links from DOM
            const links = await chrome.tabs.sendMessage(
                tab.id, 
                { action: "get_links" }
            );  
            // Finds visited links
            const visitedLinks = []
            for(const link of links) {
                if (await isVisited(link, visited)) {
                    visitedLinks.push(link)
                }
            }
            // Sends list of visited links to content script to update the color.
            chrome.tabs.sendMessage(
                tab.id, 
                { 
                    action: "change_link_color", 
                    links: visitedLinks,
                    linkColor: storage.linkColor
                }
            )
        }
    }
}

async function isVisited(url, visited) {
	if(url) {
		var key = getOrigin(url);
		if(visited?.[key]) {
			var path = await getFilteredPath(url)
			return visited[key].includes(path);
		}		
	}
	return false;
}

function containsSite(sites, url) {
	return sites.split("\n").filter(site => url.includes(site)).length;
}