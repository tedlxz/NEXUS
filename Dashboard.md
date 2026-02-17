---
title: NEXUS 成员看板
tags: [dashboard, nexus]
---

# 📊 NEXUS 成员看板

> 最后更新: `= date(now)`

---

## 成员列表

```dataviewjs
const people = dv.pages('"people"')
  .where(p => p.type === "person")
  .sort(p => p.last_contact, "desc");

// Group by closeness
const groups = {
  "核心": people.where(p => p.closeness === "high"),
  "重要": people.where(p => p.closeness === "medium"), 
  "一般": people.where(p => p.closeness === "low" || !p.closeness)
};

for (const [groupName, members] of Object.entries(groups)) {
  if (members.length === 0) continue;
  
  dv.heading(3, groupName + " (" + members.length + "人)");
  
  const tableData = members.map(p => [
    p.name,
    p.current_role ? p.current_role + (p.current_org ? ` @ ${p.current_org}` : "") : "无",
    p.tags ? p.tags.join(", ") : "无",
    p.last_contact || "无记录",
    `[[${p.name}]]`
  ]);
  
  dv.table(
    ["姓名", "职位", "Tags", "最近互动", "详情"],
    tableData
  );
}
```

---

## 最近互动

```dataview
TABLE WITHOUT ID
  contact[0] as 联系人,
  date as 日期,
  source as 来源,
  sentiment as 感受,
  tags as Tags
FROM "conversations"
SORT date DESC
LIMIT 20
```

---

## 待跟进

```dataview
TABLE WITHOUT ID
  contact[0] as 联系人,
  follow_up_date as 跟进日期,
  follow_up_context as 备注
FROM "conversations"
WHERE follow_up_date
SORT follow_up_date ASC
```

---

## 按标签分类

```dataviewjs
const allTags = new Set();
dv.pages('"people"').where(p => p.tags).forEach(p => {
  p.tags.forEach(t => allTags.add(t));
});

for (const tag of Array.from(allTags).sort()) {
  const people = dv.pages('"people"').where(p => p.tags && p.tags.includes(tag));
  dv.heading(4, "### #" + tag + " (" + people.length + "人)");
  
  dv.list(people.map(p => `[[${p.name}|${p.name}]]`));
}
```

---

*使用 [Dataview](https://blacksmithgu.github.io/obsidian-dataview/) 插件渲染*
