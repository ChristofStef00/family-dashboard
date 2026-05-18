# Home Assistant integration

The Family Dashboard exposes a small REST surface that Home Assistant can poll
to surface chores, family points, calendar status, and the Mealie meal plan.
All endpoints are unauthenticated (LAN-only deployment assumption).

Replace `[pi-ip]` below with the dashboard host (e.g. `192.168.3.20`).

## Endpoints

| Method | Path                       | Purpose                                 |
| ------ | -------------------------- | --------------------------------------- |
| GET    | `/api/ha/status`           | Chore completion %, last calendar sync  |
| GET    | `/api/ha/family`           | Family member list with today's points  |
| GET    | `/api/ha/mealplan`         | Today + next 6 days of meals (slim)     |
| POST   | `/api/ha/chore/complete`   | Mark a chore complete (`{chore_id, member_id}`) |
| POST   | `/api/ha/message`          | Push a temporary message to the display |

## Sensors — `configuration.yaml`

```yaml
sensor:
  # Overall chore completion percentage
  - platform: rest
    name: "Family chores % done today"
    resource: http://[pi-ip]:3000/api/ha/status
    value_template: "{{ value_json.chores_completion_pct }}"
    unit_of_measurement: "%"
    scan_interval: 300

  # Tonight's dinner
  - platform: rest
    name: "Tonight's Dinner"
    resource: http://[pi-ip]:3000/api/ha/mealplan
    value_template: "{{ value_json[0].dinner.recipe_name if value_json[0].dinner else 'No meal planned' }}"
    json_attributes_path: "$[0].dinner"
    json_attributes:
      - recipe_name
      - recipe_slug
      - image_url
    scan_interval: 3600
    headers:
      Content-Type: application/json

  # Tomorrow's dinner
  - platform: rest
    name: "Tomorrow's Dinner"
    resource: http://[pi-ip]:3000/api/ha/mealplan
    value_template: "{{ value_json[1].dinner.recipe_name if value_json[1].dinner else 'Nothing planned' }}"
    scan_interval: 3600
```

The `/api/ha/mealplan` payload is an ordered array of 7 days starting today.
Each day is shaped:

```json
{
  "date": "2026-05-06",
  "breakfast": null,
  "lunch":     { "recipe_name": "Sandwiches", "recipe_slug": "sandwiches", "image_url": "...", "note": null },
  "dinner":    { "recipe_name": "Chicken Tacos", "recipe_slug": "chicken-tacos", "image_url": "...", "note": null },
  "snack":     null
}
```

Each meal slot is `null` when nothing is planned. Note-type entries (e.g.
"Leftovers", "Dinner out") have `recipe_name: null` and `note` populated.

## Lovelace card snippet

Drop this into a dashboard view to surface the night's meal alongside chore
progress. The dashboard provides a custom card at
`/uploads/ha-card.js` once you copy `ha-card/family-dashboard-card.js` into
Home Assistant's `www/` folder; until then, plain entity cards work fine:

```yaml
type: vertical-stack
title: Family
cards:
  - type: entity
    entity: sensor.family_chores_done_today
    name: Chores done
  - type: picture-entity
    entity: sensor.tonight_s_dinner
    image: http://[pi-ip]:3000/uploads/placeholder.jpg  # use the recipe image_url attribute
    name: Tonight's dinner
  - type: entity
    entity: sensor.tomorrow_s_dinner
    name: Tomorrow's dinner
  - type: button
    tap_action:
      action: call-service
      service: rest_command.family_dashboard_message
      service_data:
        message: "Dinner in 5!"
    name: Ping the kitchen
```

## REST commands

For pushing chore completions or messages from automations:

```yaml
rest_command:
  family_dashboard_message:
    url: http://[pi-ip]:3000/api/ha/message
    method: POST
    content_type: 'application/json'
    payload: '{"message":"{{ message }}","ttl_seconds":30}'

  family_dashboard_complete_chore:
    url: http://[pi-ip]:3000/api/ha/chore/complete
    method: POST
    content_type: 'application/json'
    payload: '{"chore_id":{{ chore_id }},"member_id":{{ member_id }}}'
```

## Notes

- The dashboard caches Mealie data for ~1 hour. After editing the meal plan in
  Mealie, click "Sync now" in `/admin` to push it through, or wait for the next
  hourly sync.
- All Mealie API calls have a 5 second timeout; if Mealie is unreachable, the
  cached data is served and HA continues to work.
- The image URL points to the Mealie host directly, so Home Assistant must be
  on the same network as the Mealie instance.
