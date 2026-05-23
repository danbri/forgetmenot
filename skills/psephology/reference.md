# Psephology — full reference

## Postgres connection

After `npm run psephology:up`:

| | |
|---|---|
| Host | `localhost` |
| Port | `5432` |
| Database | `psephology` |
| User | `postgres` |
| URI | `postgresql://postgres@localhost:5432/psephology` |

The dump is loaded as plain SQL; no extensions required.

## Tables (full list, alphabetical)

```
ar_internal_metadata
boundary_set_legislation_items
boundary_sets
candidacies
certifications
commons_library_dashboard_countries
commons_library_dashboards
constituency_area_overlaps
constituency_area_types
constituency_areas
constituency_group_set_legislation_items
constituency_group_sets
constituency_groups
countries
election_states
elections
electorates
enablings
english_regions
genders
general_election_in_boundary_sets
general_election_states
general_elections
legislation_items
legislation_types
maiden_speeches
members
parliament_periods
political_parties
political_party_registrations
result_summaries
schema_migrations
task_records
```

`ar_internal_metadata` and `schema_migrations` are Rails plumbing.
`task_records` is the application's own job log. Everything else
is data.

## Table → ontology class mapping

The Parliament-published election ontology
(`pe: <http://parliament.uk/ontologies/election/>`) at
<https://ukparliament.github.io/ontologies/election/election-ontology.html>
maps almost one-to-one onto these tables. Use this table as the
target for an RDFification job.

| Postgres table | `pe:` class | IRI minting strategy |
|---|---|---|
| `countries` | `pe:Country` | `https://forgetmenot.local/election/Country/{id}` |
| `parliament_periods` | `pe:ParliamentPeriod` | `…/ParliamentPeriod/{id}` |
| `boundary_sets` | `pe:BoundarySet` | `…/BoundarySet/{id}` |
| `constituency_groups` | `pe:ConstituencyGroup` | `…/ConstituencyGroup/{id}` |
| `constituency_areas` | `pe:ConstituencyArea` | `…/ConstituencyArea/{id}` |
| `constituency_group_sets` | `pe:ConstituencyGroupSet` | `…/ConstituencyGroupSet/{id}` |
| `political_parties` | `pe:PoliticalParty` | `…/PoliticalParty/{id}` |
| `political_party_registrations` | `pe:PoliticalPartyRegistration` | `…/PoliticalPartyRegistration/{id}` |
| `candidacies` | `pe:Candidacy` + `pe:CandidacyResult` blank node (or `pe:WinningCandidacyResult` if `is_winning_candidacy`) | `…/Candidacy/{id}` |
| `certifications` | `pe:Certification` | `…/Certification/{id}` |
| `elections` | `pe:Election` | `…/Election/{id}` |
| `general_elections` | `pe:GeneralElection` | `…/GeneralElection/{id}` |
| `general_election_in_boundary_sets` | `pe:GeneralElectionInBoundarySet` | `…/GeneralElectionInBoundarySet/{id}` |
| `electorates` | `pe:Electorate` | `…/Electorate/{id}` |
| `legislation_items` | `pe:StatutoryThing` | `…/StatutoryThing/{id}` |
| `members` | bridge → `parl:memberId` literal on a `pe:Person` blank node attached via `pe:isOfPerson` | candidacies inherit personhood from `member_id` if present |

A `pe:Person` doesn't have its own table — it's reified per
candidacy and joined back to `members.id` when the candidacy
became an MP. The natural identity for a person is the MNIS /
Members API id (via `parl:memberId`), which keeps this corpus
consistent with the
[identity graph](../../third_party/identity-graph/).

## Predicate mapping (column → predicate)

### `candidacies` row → `pe:Candidacy` + (`pe:CandidacyResult` | `pe:WinningCandidacyResult`)

| Column | Predicate | Range |
|---|---|---|
| `candidate_given_name` | `pe:candidateGivenName` | xsd:string |
| `candidate_family_name` | `pe:candidateFamilyName` | xsd:string |
| `is_standing_as_commons_speaker` | `pe:asCommonsSpeaker` | xsd:boolean |
| `is_standing_as_independent` | `pe:asIndependent` | xsd:boolean |
| `is_notional` | `pe:isNotional` | xsd:boolean |
| `result_position` | `pe:resultPosition` | xsd:integer |
| `vote_count` | `pe:voteCount` | xsd:integer |
| `vote_share` | `pe:voteShare` | xsd:decimal |
| `vote_change` | `pe:voteChange` | xsd:decimal |
| `election_id` | `pe:inElection` → `pe:Election` | IRI |
| `member_id` (if set) | `pe:isOfPerson` → blank `pe:Person` with `parl:memberId` literal | IRI |
| `is_winning_candidacy` | controls whether the result blank node is typed `pe:WinningCandidacyResult` rather than `pe:CandidacyResult`, related to the candidacy via `pe:resultOfCandidacy` | — |

### `elections` row → `pe:Election`

| Column | Predicate | Range |
|---|---|---|
| `polling_on` | `pe:electionPollingOn` | xsd:date |
| `writ_issued_on` | `pe:writIssuedOn` | xsd:date |
| `valid_vote_count` | `pe:validVoteCount` | xsd:integer |
| `invalid_vote_count` | `pe:invalidVoteCount` | xsd:integer |
| `majority` | `pe:majority` | xsd:integer |
| `declaration_at` | `pe:declarationTime` | xsd:dateTime |
| `constituency_group_id` | `pe:forConstituencyGroup` → `pe:ConstituencyGroup` | IRI |
| `general_election_id` (if set) | `pe:formsPartOfGeneralElection` → `pe:GeneralElection` | IRI |
| `electorate_id` | `pe:hasElectorate` → `pe:Electorate` | IRI |
| `parliament_period_id` | `pe:intoParliamentPeriod` → `pe:ParliamentPeriod` | IRI |
| `is_notional` | `pe:isNotional` | xsd:boolean |

### `general_elections` row → `pe:GeneralElection`

| Column | Predicate | Range |
|---|---|---|
| `polling_on` | `pe:generalElectionPollingOn` | xsd:date |
| (per row position) | `pe:ordinality` | xsd:integer |

### `certifications` row → `pe:Certification`

| Column | Predicate | Range |
|---|---|---|
| `candidacy_id` | `pe:certificationOf` → `pe:Candidacy` | IRI |
| `political_party_id` | `pe:issuedBy` → `pe:PoliticalParty` | IRI |
| `adjunct_to_certification_id` (if set) | `pe:adjunctTo` → another `pe:Certification` | IRI |

### `electorates` row → `pe:Electorate`

| Column | Predicate | Range |
|---|---|---|
| `electors_count` (`recorded_size`) | `pe:recordedSize` | xsd:integer |
| `recorded_on` | `pe:recordedOn` | xsd:date |

### `constituency_groups` row → `pe:ConstituencyGroup`

| Column | Predicate | Range |
|---|---|---|
| `name` | `rdfs:label` | xsd:string |
| (link via `constituency_areas`) | `pe:boundedBy` → `pe:ConstituencyArea` | IRI |

### `constituency_areas` row → `pe:ConstituencyArea`

| Column | Predicate | Range |
|---|---|---|
| `boundary_set_id` | `pe:inBoundarySet` → `pe:BoundarySet` | IRI |
| `constituency_group_id` | (inverse of `pe:boundedBy`) | IRI |

### `political_party_registrations` row → `pe:PoliticalPartyRegistration`

| Column | Predicate | Range |
|---|---|---|
| `registration_identifier` | `pe:registrationID` | xsd:string |
| `name_last_updated_on` | `pe:registeredPrimaryNameLastUpdatedOn` | xsd:date |
| `political_party_id` | `pe:registrationOf` → `pe:PoliticalParty` | IRI |
| `country_id` | `pe:registrationIn` → `pe:Country` | IRI |

### `boundary_set_legislation_items` join → `pe:establishedBy`

`boundary_sets.id` `pe:establishedBy` `legislation_items.id`
(typed `pe:StatutoryThing`).

### `general_election_in_boundary_sets` → `pe:GeneralElectionInBoundarySet`

Three-way reification: `pe:forGeneralElection`,
`pe:inBoundarySet`, plus its own row IRI.

## What's NOT in the ontology

- `members` (the MP table) doesn't have a class in `pe:`. The
  bridge to the Members API goes via `parl:memberId` on the
  reified `pe:Person` attached to a candidacy. An RDFification
  should emit that bridge so an external consumer can join
  psephology to the Members API and to the identity graph.
- `maiden_speeches`, `result_summaries`, `commons_library_dashboards`
  — no `pe:` equivalents. Either skip them or model with
  `fm:` predicates per project convention.
- `english_regions`, `genders`, `constituency_area_types`,
  `election_states`, `general_election_states` are reference /
  enum tables. RDFify as `skos:Concept` in a per-domain
  `skos:ConceptScheme`.

## Counts at the 2026-05-23 dump

| Table | Rows |
|---|---|
| candidacies | 26,372 |
| certifications | 24,524 |
| electorates | 4,554 |
| elections | 4,552 |
| constituency_groups | 1,959 |
| constituency_areas | 1,959 |
| members | 1,547 |
| constituency_area_overlaps | 1,438 |
| maiden_speeches | 1,368 |
| political_party_registrations | 376 |
| political_parties | 324 |
| boundary_set_legislation_items | 84 |
| constituency_group_set_legislation_items | 84 |
| legislation_items | 79 |
| enablings | 73 |
| general_elections | 6 |
