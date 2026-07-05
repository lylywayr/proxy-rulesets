const data = window.__RULE_SITE_DATA__;
let language = "zh";

const searchInput = document.getElementById("search-input");
const groupFilter = document.getElementById("group-filter");
const resultCount = document.getElementById("result-count");
const categoryGrid = document.getElementById("category-grid");
const summaryBand = document.getElementById("summary-band");

function t(zh, en) {
  return language === "zh" ? zh : en;
}

function makeOption(value, label) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  return option;
}

function fillSelect(select, items, allLabel) {
  select.innerHTML = "";
  select.appendChild(makeOption("", allLabel));
  items.forEach((item) => select.appendChild(makeOption(item.value, item.label)));
}

function renderSummary() {
  const items = [
    [t("\u5206\u7c7b", "Groups"), data.groups.length],
    [t("\u89c4\u5219\u96c6", "Rulesets"), data.categories.length],
  ];
  summaryBand.innerHTML = items
    .map(([label, value]) => `<article class="summary-card"><div class="label">${label}</div><div class="value">${value}</div></article>`)
    .join("");
}

function filteredCategories() {
  const keyword = searchInput.value.trim().toLowerCase();
  return data.categories.filter((item) => {
    const groupOk = !groupFilter.value || item.group_slug === groupFilter.value;
    const haystack = [
      item.name,
      item.display_name_zh,
      item.display_name_en,
      item.group_name_zh,
      item.group_name_en,
    ]
      .join(" ")
      .toLowerCase();
    const keywordOk = !keyword || haystack.includes(keyword);
    return groupOk && keywordOk;
  });
}

function statTags(item) {
  return Object.entries(item.counts)
    .filter(([, value]) => value)
    .slice(0, 4)
    .map(([key, value]) => `<span class="tag">${key}: ${value}</span>`)
    .join("");
}

function rawFileLinks(item) {
  return data.clients
    .map((client) => `<a href="${item.files[client.name].raw_url}" target="_blank" rel="noreferrer">${client.name}</a>`)
    .join("");
}

function quickImportLinks(item) {
  const actions = [];
  data.clients.forEach((client) => {
    const links = item.imports[client.name] || [];
    links.forEach((entry) => {
      actions.push(`<a class="action-link" href="${entry.url}">${client.name} ${language === "zh" ? entry.label_zh : entry.label_en}</a>`);
    });
  });
  return actions.join("");
}

function renderCategories() {
  const items = filteredCategories();
  const groups = data.groups
    .map((group) => ({
      ...group,
      items: items.filter((item) => item.group_slug === group.slug),
    }))
    .filter((group) => group.items.length > 0);

  const rulesetCount = groups.reduce((sum, group) => sum + group.items.length, 0);
  resultCount.textContent = t(
    `\u5f53\u524d\u663e\u793a ${groups.length} \u4e2a\u5206\u7c7b / ${rulesetCount} \u4e2a\u89c4\u5219\u96c6`,
    `${groups.length} groups / ${rulesetCount} rulesets`
  );

  categoryGrid.innerHTML = groups
    .map((group) => `
      <section class="group-section">
        <div class="group-section-head">
          <div>
            <h3 class="group-section-title">${language === "zh" ? group.name_zh : group.name_en}</h3>
            <p class="group-section-desc">${language === "zh" ? group.description_zh : group.description_en}</p>
          </div>
          <span class="group-section-count">${group.items.length} ${t("\u4e2a\u89c4\u5219\u96c6", "rulesets")}</span>
        </div>
        <div class="rule-grid">
          ${group.items
            .map((item) => `
              <article class="category-card">
                <h4 class="card-title">${language === "zh" ? item.display_name_zh : item.display_name_en}</h4>
                <p class="card-subtitle">${item.name}</p>
                <p class="card-description">${language === "zh" ? item.description_zh : item.description_en}</p>
                <div class="tag-row">${statTags(item)}</div>
                <div class="meta-block">
                  <div class="meta-line"><strong>${t("\u539f\u59cb\u6587\u4ef6", "Rule files")}</strong></div>
                  <div class="raw-row">${rawFileLinks(item)}</div>
                </div>
                ${quickImportLinks(item) ? `
                <div class="meta-block">
                  <div class="meta-line"><strong>${t("\u4e00\u952e\u5bfc\u5165", "Quick Import")}</strong></div>
                  <div class="action-row">${quickImportLinks(item)}</div>
                </div>` : ""}
              </article>
            `)
            .join("")}
        </div>
      </section>
    `)
    .join("");
}

function rerender() {
  renderSummary();
  renderCategories();
  document.getElementById("lang-zh").classList.toggle("is-active", language === "zh");
  document.getElementById("lang-en").classList.toggle("is-active", language === "en");
}

fillSelect(groupFilter, data.groups.map((item) => ({ value: item.slug, label: item.name_zh })), "\u5168\u90e8\u5206\u7c7b");

searchInput.addEventListener("input", rerender);
groupFilter.addEventListener("change", rerender);
document.getElementById("lang-zh").addEventListener("click", () => { language = "zh"; rerender(); });
document.getElementById("lang-en").addEventListener("click", () => { language = "en"; rerender(); });

rerender();
