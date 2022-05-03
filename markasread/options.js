import { tcDefaults } from "./defaults.js"

function download() {
    chrome.storage.local.get("visited", function(obj) {
        var result = JSON.stringify(obj["visited"], null, 4); 
        var url = 'data:application/json;base64,' + btoa(result);
        chrome.downloads.download({
            url: url,
            filename: 'data.json'
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

function initializeFilters() {
    chrome.storage.local.get("filters", function(obj) {
        const filtersByOrigin = obj["filters"]
        if (filtersByOrigin) {
            renderFilters(filtersByOrigin)
        } else {
            updateFilters({})
        }
    });
}

function updateFilters(filtersByOrigin) {
    chrome.storage.local.set({"filters": filtersByOrigin}, undefined)
}

function renderFilters(filtersByOrigin) {
    const header = document.getElementById("thead")
    var tbody = document.getElementById('tbody');
    tbody.innerHTML = ""
    Object.keys(filtersByOrigin).forEach(origin => {
        const filtersTextBlock = filtersByOrigin[origin].join("\n")
        let tr = "<tr>";
        tr += "<td>" + origin + "</td>" + `<td><textarea rows="4" columns="50">` + filtersTextBlock + "</textarea></td>" 
              + "<td><input></td>"
              + "<td></td>"
              + "<td></td>"
              + "</tr>";
        tbody.innerHTML += tr
    })
    if (tbody.innerHTML.length > 0) {
        header.innerHTML = "<tr> <th>URL Origin</th> <th>Regex Filter</th> <th>Test Example</th> <th>Matches</th> <th>Result</th></tr>"
    }

    tbody.querySelectorAll("textarea").forEach(
        textarea => textarea.addEventListener("focusout", (event) => {
            const row = textarea.parentElement.parentElement
            const rowData = row.querySelectorAll("td")
            const origin = rowData[0].innerText
            const filters = rowData[1].querySelector("textarea").value.split("\n")
            clearFilterKey(origin)
            console.log("text area updated")
            filters.forEach(filter => {
                addFilter(origin, filter)
            })
            
        }))
    tbody.querySelectorAll("tr").forEach(tr => {
        const rowData = tr.querySelectorAll("td")
            const filters = rowData[1].querySelector("textarea").value.split("\n")
            rowData[2].addEventListener("change", (event) => {
                let initialText = event.target.value
                let resultText = event.target.value
                filters.forEach(filter => {
                    resultText = resultText.replace(new RegExp(filter), "")
                })

                // rowData[3].innerHTML = findDiff(initialText, resultText)
                rowData[4].innerHTML = resultText
                console.log("Calculated example result")
            })
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

function addFilter(url, filter) {
    chrome.storage.local.get("filters", function(obj) {
        const filtersByOrigin = obj["filters"]
        var origin = getOrigin(url);

        if (filtersByOrigin[origin]) {
            if (filtersByOrigin[origin].indexOf(filter) === -1) {
                filtersByOrigin[origin].push(filter)
            }
        } else {
            filtersByOrigin[origin] = [filter];
        }
        updateFilters(filtersByOrigin)
        renderFilters(filtersByOrigin)
    });
}

function clearFilters() {
    updateFilters({})
}

function clearFilterKey(originKey) {
    chrome.storage.local.get("filters", function(obj) {
        const filtersByOrigin = obj["filters"]
        filtersByOrigin[originKey] = [] 
    });
}

// TODO move this into a lib
function getOrigin(url) {
    return new URL(url).origin;
}

document.addEventListener('DOMContentLoaded', async function() {
    document.getElementById("download").addEventListener("click", download);
    document.getElementById('upload').addEventListener("change", upload, false);
    document.getElementById("import").addEventListener('click', openDialog);
    document.getElementById("clear").addEventListener('click', clearData);
    document.getElementById("save").addEventListener("click", saveOptions);
	document.getElementById("restore").addEventListener("click", restoreDefaults);
    document.getElementById("add-filter").addEventListener('click', addFilterFromInput);
    document.getElementById("clear-filters").addEventListener('click', () => {
        clearFilters(); 
        initializeFilters()
    });
	restoreOptions();
    initializeFilters();
}, false);