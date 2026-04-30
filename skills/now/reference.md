# Annunciator (Now) API — full endpoint reference

Cached spec: [`_specs/now.json`](../../_specs/now.json)
Endpoint table: [`_specs/endpoint-tables/now.txt`](../../_specs/endpoint-tables/now.txt)

Base URL: `https://now-api.parliament.uk/api`

## Endpoints

- `GET /Message/message/{annunciator}/current` — current state.
- `GET /Message/message/{annunciator}/{date}` — earliest message
  posted on or after `{date}`.

## Response shape

```jsonc
{
  "annunciatorDisabled": false,
  "id": 175089,
  "slides": [
    {
      "type": "BlankSlide" | "TitleSlide" | "ContributionSlide" | ...,
      "lines": [],
      "carouselOrder": 1,
      "carouselDisplaySeconds": 20,
      "speakerTime": null,
      "slideTime": "2026-04-29T14:07:18.4667359",
      "soundToPlay": null,
      "id": 0
    }
  ],
  "scrollingMessages": [],
  "annunciatorType": "CommonsMain",
  "publishTime": "2026-04-29T14:07:17.964",
  "isSecurityOverride": false,
  "showCommonsBell": false,
  "showLordsBell": false
}
```

## Known annunciator zones

| Slug | Where |
|---|---|
| `CommonsMain` | Main Commons chamber |
| `LordsMain` | Main Lords chamber |
| Committee-room slugs | Committee corridor screens (slugs vary; the API does not currently expose a list — pass a known slug or watch the parliament.uk site source) |

## Notes

- Slide content `lines[]` is rendered verbatim on the screens; use
  it as a structured "what's happening now" indicator.
- The API has no list-of-zones endpoint; the zone slugs are
  effectively a closed set defined by Parliament's broadcasting team.
