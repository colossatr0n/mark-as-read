import { tcDefaults } from "./defaults.js"

chrome.runtime.onInstalled.addListener(function() {
    fetchMarkData();
    // TODO check this
    fetchFilterData();
})

function updateDictionary(visited) {
    return chrome.storage.local.set({ "visited": visited }).then(() => {
        if (chrome.runtime.error) {
            console.log("Runtime error.");
        }
    });
}

function updateFiltersDictionary(filtersByOrigin) {
    chrome.storage.local.set({ "filters": filtersByOrigin }, function() {
        if (chrome.runtime.error) {
            console.log("Runtime error.");
        }
    });
}

chrome.runtime.onStartup.addListener(function() {
    fetchMarkData();
    // TODO check this
    fetchFilterData();
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

function markAsNotVisited(atabId) {
    // console.log("markAsNotVisited");
    return chrome.action.setIcon({ path: "notvisited.png", tabId: atabId });
}

function markAsVisited(atabId) {
    // console.log("markAsVisited");
    return chrome.action.setIcon({ path: "visited.png", tabId: atabId });
}

// TODO check this
function fetchFilterData() {
    chrome.storage.local.get("filters", function(obj) {
        if (obj["filters"] == undefined) {
            filtersByOrigin = {};
        } else {
            var objFilters = obj["filters"];
            filtersByOrigin = objFilters
        }
    });
}

chrome.runtime.onMessage.addListener(async function(msg) {
    if (msg.action === 'import') {
        var data = msg.data;

        // filter/map/forEach do not support async/await, hence the usage of "for"
        const keys = Object.keys(data).filter(key => key != 'version')
        for (const key of keys) {
            for (const value of data[key]) {
                if (!await markedAsRead(key + value)) {
                    await addUrl(key + value)
                }
            }
        }
    } else if (msg.action === 'process_post_load_elements') {
        const visited = []
        for(const link of msg.links) {
            if (await markedAsRead(link)) {
                visited.push(link)
            }
        }
        chrome.tabs.sendMessage(sender.tab.id, {action: "change_link_color", links: visited, linkColor: "red"})
    }
    sendResponse()
});

async function removeUrl(url) {
    // console.log("Remove URL")
    var key = getOrigin(url);
    // console.log(`Key ${key}`)
    var path = getFilteredPath(url)
    const obj = await fetchMarkData()
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
        var key = getKey(url);
        const obj = await fetchMarkData()
        const visited = obj["visited"]
        if (visited?.[key]) {
            var path = getFilteredPath(url)
            return visited[key].includes(path);
        }
    }
    return false
}

function removeFilter(url) {
    // console.log("Remove URL")
    var origin = getOrigin(url);
    // console.log(`Key ${key}`)
    var filteredPath = getFilteredPath(url)
    // console.log(`Path ${path}`)
    // TODO update this block
    const index = filtersByOrigin[origin].indexOf(filteredPath);
    // console.log(`Index ${index}`)
    if (index > -1) {
        filtersByOrigin[origin].splice(index, 1);
    }
    if (!filtersByOrigin[origin].length) {
        delete filtersByOrigin[origin];
    }
}

async function addUrl(url) {
    // console.log("Add URL")
    const key = getOrigin(url);
    // console.log(`Key ${key}`)
    const path = getFilteredPath(url)

    // console.log(`Path ${path}`)
    const obj = await fetchMarkData()
    const visited = obj["visited"]
    if (visited[key]) {
        visited[key].push(path);
    } else {
        visited[origin] = [path];
    }
    await updateDictionary(visited)
}

function addFilterFromInput(url, filter) {
    // console.log("Add URL")
    var origin = getOrigin(url);

    // TODO update this block
    if (filtersByOrigin[origin]) {
        filtersByOrigin[origin].push(filter);
    } else {
        filtersByOrigin[origin] = [filter];
    }
}

function getOrigin(url) {
    return new URL(url).origin;
}

function getFilteredPath(url) {
    const path = url.replace(origin, '');
    // TODO update this block
    if (filtersByOrigin) {
        return path.replace(filtersByOrigin[origin] ?? "", "")
    }
    return path.replace(path, "")
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
            const visitedLinks = links.filter(link => isVisited(link, visited))
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

function isVisited(url, visited) {
	if(url) {
		var key = getOrigin(url);
		if(visited?.[key]) {
			var path = url.replace(key, '');
			return visited[key].includes(path);
		}		
	}
	return false;
}

function containsSite(sites, url) {
	return sites.split("\n").filter(site => url.includes(site)).length;
}