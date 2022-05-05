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

function upload() {
    var file = this.files[0];
    var reader = new FileReader();
    reader.onload = function(e) {
        var result = JSON.parse(e.target.result);
        chrome.runtime.sendMessage({ action: 'import', data: result });
    }
    reader.readAsText(file);
    upload.value = '';
}

function openDialog() {
    document.getElementById('upload').click();
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
    const obj = await chrome.storage.local.get("filters")
    const filters = obj["filters"]
    if (filters) {
        renderFilters(filters)
    } else {
        await saveFilters({})
    }
}

// Duplicate function. Move into util or somthing.
function saveFilters(filters) {
    return chrome.storage.local.set({"filters": filters})
}

// Duplicate function. Move into util or somthing.
function saveVisited(visited) {
    return chrome.storage.local.set({"visited": visited})
}

function renderFilters(filters) {
    const header = document.getElementById("thead")
    var tbody = document.getElementById('tbody');
    const addRowHtml = `<tr><td colspan="5" style="text-align: center"><button style="width: 100%" id="add-row">Add Row</button></td></tr>`
    tbody.innerHTML = ""
    Object.keys(filters).forEach(origin => {
        const filtersTextBlock = filters[origin].join("\n")
        let tr = "";
        tr += `<tr>` 
            + `<td><button class="margin-lr remove-filters">Remove</button></td>` 
            + `<td style="width: 200px; text-align: center">` + origin + "</td>" 
            + `<td><textarea class="regex-filters" rows="4" columns="50">` + filtersTextBlock + "</textarea></td>" 
            + `<td><textarea rows="4" columns="100"></textarea></td>`
            + `<td></td>`
            + "</tr>";
        tbody.innerHTML += tr
    })
    tbody.innerHTML += addRowHtml 
    header.innerHTML = "<tr>" 
                        + `<th>Action</th>`
                        + "<th>URL Origin</th>"  
                        + "<th>Regex Filter</th>" 
                        + "<th>Test Example</th>"
                        + "<th>Result</th></tr>"

    // TODO use this to add any rows, even when generating using filters.
    tbody.querySelector("#add-row").addEventListener("click", (event) => {
        const row = event.target.parentElement.parentElement
        const el = `<tr>` 
            // + button.outerHTML
            + `<td><button class="margin-lr remove-filters">Remove</button></td>` 
            + `<td style="width: 200px; text-align: center"></td>` 
            + `<td><textarea class="regex-filters" rows="4" columns="50"></textarea></td>` 
            + `<td><textarea rows="4" columns="100"></textarea></td>`
            + `<td></td>`
            + "</tr>";
        row.insertAdjacentHTML('beforeBegin', el)
        const newRow = row.previousElementSibling
        newRow.querySelector(".remove-filters").addEventListener("click", async () => {
            const rowData = newRow.querySelectorAll("td")
            const origin = rowData[1].innerText
            if (origin) {
                await removeFiltersForUrlOrigin(origin)
            } else {
                newRow.remove()
            }
        })
    })

    tbody.querySelectorAll(".regex-filters").forEach(
        textarea => textarea.addEventListener("focusout", async () => {
            const row = textarea.parentElement.parentElement
            const rowData = row.querySelectorAll("td")
            const origin = rowData[1].innerText
            const filters = rowData[2].querySelector("textarea").value.split("\n")
            await clearFilterKey(origin)
            console.log("text area updated")
            filters.forEach(filter => {
                addFilter(origin, filter)
            })
            
        })
    )

    tbody.querySelectorAll(".remove-filters").forEach(
        button => button.addEventListener("click", async () => {
            const row = button.parentElement.parentElement
            const rowData = row.querySelectorAll("td")
            const origin = rowData[1].innerText
            if (origin) {
                await removeFiltersForUrlOrigin(origin)
            } else {
                row.remove()
            }
        })
    )

    tbody.querySelectorAll("tr").forEach(tr => {
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

// function findDiff(str2, str1){ 
//     let diff= "";
//     str2.split('').forEach(function(val, i){
//       if (val != str1.charAt(i)) {
//         diff += `<b style="color: red">` + val + "</b>";         
//       } else {
//           diff += val
//       }
//     });
//     return diff;
//   }

function addFilterFromInput() {
    const url = document.getElementById("url-origin").value
    const filter = document.getElementById("filters").value
    addFilter(url, filter)
}

async function addFilter(url, filter) {
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
    saveFilters(filtersByOrigin)
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

document.addEventListener('DOMContentLoaded', async function() {
    document.getElementById("download-visited").addEventListener("click", () => download("visited"));
    document.getElementById("download-filters").addEventListener("click", () => download("filters"));
    document.getElementById('upload').addEventListener("change", upload, false);
    document.getElementById("import").addEventListener('click', openDialog);
    document.getElementById("clear").addEventListener('click', clearData);
    document.getElementById("save").addEventListener("click", saveOptions);
	document.getElementById("restore").addEventListener("click", restoreDefaults);
    document.getElementById("clear-visited").addEventListener('click', clearVisited);
    document.getElementById("add-filter").addEventListener('click', addFilterFromInput);
    document.getElementById("clear-filters").addEventListener('click', async () => {
        await clearFilters(); 
        initializeFilters()
    });
	restoreOptions();
    await initializeFilters();
}, false);