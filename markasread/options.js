import { tcDefaults } from "./defaults.js"

function download(key) {
    chrome.storage.local.get(key, function(obj) {
        var result = JSON.stringify(obj[key], null, 4);
        var url = 'data:application/json;base64,' + btoa(result);
        chrome.downloads.download({
            url: url,
            filename: `${key}.json`
        });
    });
}

function upload(key, file) {
    var reader = new FileReader();
    reader.onload = function(e) {
        var result = JSON.parse(e.target.result);
        chrome.runtime.sendMessage({ action: `import-${key}`, data: result }).then(
            result => renderFilters(result)
        )
    }
    reader.readAsText(file);
    upload.value = '';
}

function openVisitedDialog() {
    document.getElementById('upload-visited').click();
}

function openFilterDialog() {
    document.getElementById('upload-filters').click();
}

function clearData() {
    chrome.storage.local.clear();
}

async function saveOptions() {
	var changeLinkColor = document.getElementById("changeLinkColor").checked;
	var linkColor = document.getElementById("linkColor").value;
	var sites = document.getElementById("sites").value;

	await chrome.storage.local.remove([
		"changeLinkColor",
		"linkColor",
		"sites"
	]);
	await chrome.storage.local.set(
		{
			changeLinkColor: changeLinkColor || tcDefaults.changeLinkColor,
			linkColor: linkColor || tcDefaults.linkColor,
			sites: sites || tcDefaults.sites
		}
    )
    // Update status to let user know options were saved.
    var status = document.getElementById("status");
    status.textContent = "Options saved";
    setTimeout(function() {
        status.textContent = "";
    }, 1000);
}

async function restoreDefaults() {
	await chrome.storage.local.set(tcDefaults)
    await restoreOptions();
    // Update status to let user know options were saved.
    var status = document.getElementById("status");
    status.textContent = "Default options restored";
    setTimeout(function() {
        status.textContent = "";
    }, 1000);
}

function restoreOptions() {
	return chrome.storage.local.get(tcDefaults).then(storage => {
		document.getElementById("changeLinkColor").checked = storage.changeLinkColor != tcDefaults.changeLinkColor ? storage.changeLinkColor : false;
		document.getElementById("linkColor").value = storage.linkColor != tcDefaults.linkColor ? storage.linkColor : "";
		document.getElementById("sites").value = storage.sites != tcDefaults.sites ? storage.sites : "";
	});
}

async function initializeFilters() {
    const filters = await fetchFilters() ?? {}
    renderFilters(filters)
}

async function fetchFilters() {
    const obj = await chrome.storage.local.get("filters")
    return obj["filters"]
}

// Duplicate function. Move into util or something.
function saveFilters(filters) {
    return chrome.storage.local.set({"filters": filters})
}

// Duplicate function. Move into util or something.
function saveVisited(visited) {
    return chrome.storage.local.set({"visited": visited})
}

function createRowHtml(origin, filtersTextBlock) {
    return `<tr class="filter-row">` 
    + `<td>
           <div class="margin-lr">
                <div><button style="width: 100%" class="remove-filters">Remove</button></div>
                <div><button style="width: 100%; margin-top: 5px" class="save-filters">Save</button></div>
           </div>
       </td>` 
    + `<td><textarea class="url-origin" rows="4" columns="50">${origin}</textarea></td>` 
    + `<td><textarea class="regex-filters" rows="4" columns="50">${filtersTextBlock}</textarea></td>` 
    + `<td><textarea rows="4" columns="100"></textarea></td>`
    + `<td></td>`
    + "</tr>";
}

function addRowEventListeners(newRow) {
    newRow.querySelector(".remove-filters").addEventListener("click", async () => {
        const rowData = newRow.querySelectorAll("td")
        const origin = rowData[1].querySelector("textarea").value
        if (origin) {
            await removeFiltersForUrlOrigin(origin)
        } else {
            newRow.remove()
        }
    })

    newRow.querySelector(".save-filters").addEventListener("click", async () => {
            const rowData = newRow.querySelectorAll("td")
            const origin = rowData[1].querySelector("textarea").value
            if (origin) {
                const filters = rowData[2].querySelector("textarea").value.split("\n")
                await clearFilterKey(origin)
                console.log("text area updated")
                for(const filter of filters) {
                    await addFilter(origin, filter)
                }
            } 
        })
}

function addRowsFromFilters(filters) {
    var tbody = document.getElementById('tbody');
    const lastRow = tbody.querySelector("#add-row")
    Object.keys(filters).forEach(origin => {
        const filtersTextBlock = filters[origin].join("\n")
        createRowBefore(lastRow, origin, filtersTextBlock)
    })
}

function createRowBefore(nextSibling, origin, filtersTextBlock) {
    let tr = createRowHtml(origin, filtersTextBlock)
    nextSibling.insertAdjacentHTML('beforeBegin', tr)
    const newRow = nextSibling.previousElementSibling
    addRowEventListeners(newRow)
}

function renderFilters(filters) {
    var tbody = document.getElementById('tbody');
    tbody.innerHTML = `<tr id="add-row"><td colspan="5" style="text-align: center"><button style="width: 100%" id="add-row-button">Add Row</button></td></tr>`

    addRowsFromFilters(filters)

    tbody.querySelector("#add-row-button").addEventListener("click", (event) => {
        const row = event.target.parentElement.parentElement
        createRowBefore(row, "", "")
    })

    tbody.querySelectorAll(".remove-filters").forEach(
        button => button.addEventListener("click", async () => {
            const row = button.parentElement.parentElement.parentElement
            const rowData = row.querySelectorAll("td")
            const origin = rowData[1].innerText
            if (origin) {
                await removeFiltersForUrlOrigin(origin)
            } else {
                row.remove()
            }
        })
    )

    tbody.querySelectorAll(".filter-row").forEach(tr => {
        const rowData = tr.querySelectorAll("td")
            const filters = rowData[2].querySelector("textarea")?.value.split("\n")
            if (filters) {
                rowData[3].addEventListener("change", (event) => {
                    let resultText = event.target.value
                    filters.forEach(filter => {
                        resultText = resultText.replace(new RegExp(filter), "")
                    })

                    rowData[4].innerText = resultText 
                                            ? "Input:\n" + event.target.value + "\n\nOutput:\n" + resultText 
                                            : ""
                })
            }
    })
}

async function addFilter(url, filter) {
    if (!filter && !url) {
        return
    }
    const obj = await chrome.storage.local.get("filters")
    const filtersByOrigin = obj["filters"]
    var origin = getOrigin(url);

    if (filtersByOrigin[origin]) {
        if (filtersByOrigin[origin].indexOf(filter) === -1) {
            filtersByOrigin[origin].push(filter)
        }
    } else {
        filtersByOrigin[origin] = [filter];
    }
    await saveFilters(filtersByOrigin)
    renderFilters(filtersByOrigin)
}

async function removeFiltersForUrlOrigin(origin) {
    const obj = await chrome.storage.local.get("filters")
    const filtersByOrigin = obj["filters"]

    if (filtersByOrigin[origin]) {
        delete filtersByOrigin[origin]
    } 
    saveFilters(filtersByOrigin)
    // TODO should rendering be done outside of this function
    renderFilters(filtersByOrigin)
}

function clearFilters() {
    return saveFilters({})
}

function clearVisited() {
    return saveVisited({})
}

async function clearFilterKey(originKey) {
    const obj = await chrome.storage.local.get("filters")
    const filtersByOrigin = obj["filters"]
    filtersByOrigin[originKey] = [] 
    await saveFilters(filtersByOrigin)
}

// TODO move this into a lib
function getOrigin(url) {
    return new URL(url).origin;
}

// TODO imported regex aren't escaped correctly. How to fix?
document.addEventListener('DOMContentLoaded', async function() {
    document.getElementById("download-visited").addEventListener("click", () => download("visited"));
    document.getElementById("download-filters").addEventListener("click", () => download("filters"));
    document.getElementById('upload-visited').addEventListener("change", (event) => upload("visited", event.target.files[0]), false);
    document.getElementById('upload-filters').addEventListener(
        "change", 
        (event) => upload("filters", event.target.files[0]),
        false);
    document.getElementById("import-visited").addEventListener('click', openVisitedDialog);
    document.getElementById("import-filters").addEventListener('click', openFilterDialog);
    document.getElementById("clear").addEventListener('click', clearData);
    document.getElementById("save").addEventListener("click", saveOptions);
	document.getElementById("restore").addEventListener("click", restoreDefaults);
    document.getElementById("clear-visited").addEventListener('click', clearVisited);
    document.getElementById("clear-filters").addEventListener('click', async () => {
        await clearFilters(); 
        initializeFilters()
    });
	restoreOptions();
    await initializeFilters();
}, false);