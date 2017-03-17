ALTER TABLE `cms_pagesData`
CHANGE `body` `body1` text COLLATE 'utf8mb4_unicode_ci' NOT NULL AFTER `slug`,
ADD `body2` text COLLATE 'utf8mb4_unicode_ci' NOT NULL,
ADD `body3` text COLLATE 'utf8mb4_unicode_ci' NOT NULL AFTER `body2`,
ADD `body4` text COLLATE 'utf8mb4_unicode_ci' NOT NULL AFTER `body3`,
ADD `body5` text COLLATE 'utf8mb4_unicode_ci' NOT NULL AFTER `body4`,
ADD `body6` text COLLATE 'utf8mb4_unicode_ci' NOT NULL AFTER `body5`;
