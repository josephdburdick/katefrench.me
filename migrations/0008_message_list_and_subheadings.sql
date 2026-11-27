UPDATE content
SET attributes = json_remove(attributes, '$.city.key')
WHERE key = 'new-york';

UPDATE content
SET attributes = json_set(
  json_remove(attributes, '$.email.greetingNote'),
  '$.email.paragraphs',
  json((
    SELECT json_group_array(line)
    FROM (
      SELECT (
        SELECT group_concat(json_extract(sentence.value, '$.text'), ' ')
        FROM json_each(paragraph.value) AS sentence
      ) AS line
      FROM json_each(content.attributes, '$.email.paragraphs') AS paragraph
      ORDER BY paragraph.key
    )
  ))
)
WHERE key = 'message'
  AND json_type(attributes, '$.email.paragraphs[0]') = 'array';

-- json_patch keeps the first object's key order, so the edit screen lists the subheading right under the heading.
UPDATE content
SET attributes = json_patch(
  json_object('heading', json_extract(attributes, '$.heading'), 'subheading', ''),
  attributes
)
WHERE key IN ('new-york', 'message', 'marketing', 'venues');

UPDATE content
SET attributes = json_set(
  attributes,
  '$.steps',
  json_patch(
    json_object('heading', json_extract(attributes, '$.steps.heading'), 'subheading', ''),
    json_extract(attributes, '$.steps')
  )
)
WHERE key = 'first-call';
