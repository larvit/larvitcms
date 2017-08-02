ALTER TABLE cms_pagesData DROP FOREIGN KEY cms_pagesData_ibfk_1;

ALTER TABLE cms_pagesData MODIFY COLUMN pageUuid binary(16) NOT NULL;

ALTER TABLE cms_pagesData DROP PRIMARY KEY;

ALTER TABLE cms_pages MODIFY uuid binary(16) NOT NULL;
ALTER TABLE cms_pages MODIFY COLUMN id INT;
ALTER TABLE cms_pages DROP PRIMARY KEY;
ALTER TABLE cms_pages ADD PRIMARY KEY (uuid);
ALTER TABLE cms_pages DROP COLUMN id;

ALTER TABLE cms_pagesData ADD PRIMARY KEY (pageUuid, lang);

ALTER TABLE cms_pagesData ADD CONSTRAINT cms_pagesData_ibfk_1 FOREIGN KEY (pageUuid) REFERENCES cms_pages(uuid);

ALTER TABLE cms_pagesData DROP pageId;