ALTER TABLE `cms_snippets`
CHANGE `slug` `name` varchar(100) COLLATE 'utf8mb4_bin' NOT NULL FIRST,
CHANGE `lang` `lang` char(2) COLLATE 'utf8mb4_bin' NOT NULL DEFAULT 'en' AFTER `name`;
