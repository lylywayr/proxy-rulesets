const data = window.__RULE_SITE_DATA__;
let language = "zh";

const searchInput = document.getElementById("search-input");
const clientFilter = document.getElementById("client-filter");
const groupFilter = document.getElementById("group-filter");
const topicFilter = document.getElementById("topic-filter");
const resultCount = document.getElementById("result-count");
const categoryGrid = document.getElementById("category-grid");
const summaryBand = document.getElementById("summary-band");
const clientOverview = document.getElementById("client-overview");
const groupOverview = document.getElementById("group-overview");
const topicOverview = document.getElementById("topic-overview");

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
    [t("分类总数", "Categories"), data.categories.length],
    [t("客户端", "Clients"), data.clients.length],
    [t("分组", "Groups"), data.groups.length],
    [t("专题", "Topics"), data.topics.length],
  ];
  summaryBand.innerHTML = items
    .map(([label, value]) => `<article class="summary-card"><div class="label">${label}</div><div class="value">${value}</div></article>`)
    .join("");
}

function filteredCategories() {
  const keyword = searchInput.value.trim().toLowerCase();
  return data.categories.filter((item) => {
    const clientOk = !clientFilter.value || item.files[clientFilter.value];
    const groupOk = !groupFilter.value || item.group_slug === groupFilter.value;
    const topicOk = !topicFilter.value || item.topics.some((topic) => topic.slug === topicFilter.value);
    const haystack = [
      item.name,
      item.display_name_zh,
      item.display_name_en,
      item.group_name_zh,
      item.group_name_en,
      ...item.topics.map((topic) => topic.title_zh),
    ]
      .join(" ")
      .toLowerCase();
    const keywordOk = !keyword || haystack.includes(keyword);
    return clientOk && groupOk && topicOk && keywordOk;
  });
}

function statTags(item) {
  return Object.entries(item.counts)
    .filter(([, value]) => value)
    .slice(0, 4)
    .map(([key, value]) => `<span class="tag">${key}: ${value}</span>`)
    .join("");
}

function clientActionButtons(item) {
  const blocks = [];
  data.clients.forEach((client) => {
    const imports = item.imports[client.name] || [];
    const rawUrl = item.files[client.name].raw_url;
    blocks.push(`<div class="meta-line"><strong>${client.name}</strong> · <a href="${rawUrl}" target="_blank" rel="noreferrer">Raw</a></div>`);
    imports.forEach((entry) => {
      blocks.push(`<a class="action-link" href="${entry.url}">${entry.label_zh}</a>`);
    });
  });
  return blocks.join("");
}

function sourceLines(item) {
  return (item.sources || [])
    .slice(0, 6)
    .map((source) => `<div class="meta-line"><a href="${source.url}" target="_blank" rel="noreferrer">${source.name || source.url}</a></div>`)
    .join("");
}

function renderCategories() {
  const items = filteredCategories();
  resultCount.textContent = t(`当前显示 ${items.length} 个分类`, `${items.length} categories`);
  categoryGrid.innerHTML = items
    .map((item) => `
      <article class="category-card">
        <div class="card-topline">
          <div>
            <h3 class="card-title">${language === "zh" ? item.display_name_zh : item.display_name_en}</h3>
            <p class="card-subtitle">${item.name}</p>
          </div>
          <span class="group-pill">${language === "zh" ? item.group_name_zh : item.group_name_en}</span>
        </div>
        <p class="card-description">${language === "zh" ? item.description_zh : item.description_en}</p>
        <div class="tag-row">${statTags(item)}</div>
        <div class="meta-block">
          <div class="meta-line"><strong>${t("专题", "Topics")}</strong>: ${item.topics.length ? item.topics.map((topic) => language === "zh" ? topic.title_zh : topic.title_en).join(" / ") : t("无", "None")}</div>
          <div class="meta-line"><strong>${t("原始文件", "Rule files")}</strong></div>
          <div class="raw-row">
            ${data.clients
              .map((client) => `<a href="${item.files[client.name].raw_url}" target="_blank" rel="noreferrer">${client.name}</a>`)
              .join("")}
          </div>
        </div>
        <div class="meta-block">
          <div class="meta-line"><strong>${t("客户端一键入口", "Client actions")}</strong></div>
          <div class="action-row">${clientActionButtons(item)}</div>
        </div>
        <div class="meta-block">
          <div class="meta-line"><strong>${t("数据来源", "Sources")}</strong></div>
          ${sourceLines(item)}
        </div>
      </article>
    `)
    .join("");
}

function renderSideCollections() {
  clientOverview.innerHTML = data.clients
    .map((client) => `
      <article class="stack-item">
        <h4>${client.name}</h4>
        <p>${language === "zh" ? client.usage_zh : client.usage_en}</p>
        <p class="minor">${t("格式", "Format")}: ${language === "zh" ? client.format_zh : client.format_en}</p>
      </article>
    `)
    .join("");

  groupOverview.innerHTML = data.groups
    .map((group) => `
      <article class="stack-item">
        <h4>${language === "zh" ? group.name_zh : group.name_en}</h4>
        <p>${language === "zh" ? group.description_zh : group.description_en}</p>
        <p class="minor">${t("分类数", "Categories")}: ${group.count}</p>
      </article>
    `)
    .join("");

  topicOverview.innerHTML = data.topics
    .map((topic) => `
      <article class="stack-item">
        <h4>${language === "zh" ? topic.title_zh : topic.title_en}</h4>
        <p>${language === "zh" ? topic.description_zh : topic.description_en}</p>
        <p class="minor">${t("分类数", "Categories")}: ${topic.categories.length}</p>
      </article>
    `)
    .join("");
}

function rerender() {
  renderSummary();
  renderCategories();
  renderSideCollections();
  document.getElementById("lang-zh").classList.toggle("is-active", language === "zh");
  document.getElementById("lang-en").classList.toggle("is-active", language === "en");
}

fillSelect(clientFilter, data.clients.map((item) => ({ value: item.name, label: item.name })), "全部客户端");
fillSelect(groupFilter, data.groups.map((item) => ({ value: item.slug, label: item.name_zh })), "全部分组");
fillSelect(topicFilter, data.topics.map((item) => ({ value: item.slug, label: item.title_zh })), "全部专题");

searchInput.addEventListener("input", rerender);
clientFilter.addEventListener("change", rerender);
groupFilter.addEventListener("change", rerender);
topicFilter.addEventListener("change", rerender);
document.getElementById("lang-zh").addEventListener("click", () => { language = "zh"; rerender(); });
document.getElementById("lang-en").addEventListener("click", () => { language = "en"; rerender(); });

rerender();
