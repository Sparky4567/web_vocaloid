# Voice model rights and third-party notices

Chorus's [MIT license](LICENSE) covers its original code and documentation. It
does not replace or broaden any rights granted by the owners of voice models,
vocoders, characters, artwork, datasets, or other dependencies. Those materials
retain their own terms. Installing a model does not establish permission for
every use of it, and changing Chorus's license cannot grant that permission.

## LIEE by julieraptor

The downloader uses **LIEE : Immortal Idol 'Lilia' — JubiLIEE 2025 1.1**, from
the creator's [MM2.8 release](https://github.com/julieraptor/DIFFSINGER-LIEE-Immortal-Idol/releases/tag/MM2.8).
The voice and character are created by **julieraptor**; Chorus claims no ownership
of them and no endorsement by the creator.

The authoritative [LIEE Terms of Use](https://docs.google.com/document/d/1t13WKc7VA2Q3G_MppznbAwhl3vLIL2MNPyjVN3kWDDg/edit)
were reviewed on November 14, 2026; the document lists its latest update as
November 11, 2026. This notice summarizes requirements and does not replace the
full terms. The terms may change; review them before use and before publishing.

### Voice, outputs, and services

- The database is free to use for individual and corporate work, including
  commercial work subject to the full terms. Selling the database or its raw
  data, or monetizing use of either, is prohibited. Raw data includes distributed
  ONNX files, YAML files, and singing/speech corpus audio.
- Online hosting of the database or raw data requires prior permission from the
  creator. Monetized hosting requires written permission and advance discussion
  of revenue sharing. Any hosting permission must be clearly accessible on the
  service. Chorus supplies no such permission. Local installation instructions
  are not authorization to deploy a hosted singing service.
- Exported audio may be edited and used in commercial or non-commercial works
  under the terms. Credit the vocalist as **LIEE** in the description, post, or
  song credits, including for backing vocals. A featured artist credit in a song
  title is not required. Example: `Vocals: LIEE`.
- Raw data and output audio must not be inputs to AI voice changers or
  instruments, automated voice services, sample packs, or similar uses. They
  must not create or supplement another voice database; contact the creator
  about ports to other singing synthesizers. The terms name exceptions for
  training data from LIEE : Immortal Idol Proof of Concept and LIEE Filipino
  Singing Corpus; do not assume those exceptions cover the MM2.8 voicebank.
- Raw data and outputs must not support AI recreations of celebrities, paid
  synthesis voices, copyrighted fictional characters, or other public figures.
  The terms also prohibit AI-generated music and other generative AI contexts,
  and prohibit pornographic use of raw data or output audio.

**Permission boundary:** the terms allow singing synthesis while also restricting
generative AI contexts and automated voice services. This notice does not resolve
how those provisions apply to Chorus's neural adapter. Obtain clarification from
the creator before using LIEE in a workflow whose permission is unclear. Use the
classic voices if LIEE permission has not been established for your intended use.

### Character and content

Character visuals have separate rules: individual commercial and non-commercial
use is allowed under the terms; corporate use requires a license from the
creator. Credit the artist when using official artwork. Official artwork cannot
be sold or used commercially on items such as album covers or merchandise, or
used as generative AI input. AI-generated depictions of LIEE are prohibited.
Designs inspired by LIEE must acknowledge that inspiration. Consult the full
terms for all character provisions; permissions for character depictions do not
override restrictions on voice audio.

The terms ask users to refrain from political or religious bias, indecent
content, impersonation or harm to the creator or others, and other content the
creator deems inappropriate. Illegal content, explicit underage sexual content,
and hateful or bigoted content are prohibited. Upon breach, the terms require
ceasing database-related activities and removing its files and the offending
content from related platforms. The creator and database developers disclaim
responsibility for resulting incidents, losses, and legal issues.

Questions and permission requests: **liee.immortal.idol@gmail.com**. No written
hosting permission is recorded or claimed by this repository.

## OpenVPI / DiffSinger Community vocoder

The voicebank includes vocoder model weights provided by **OpenVPI / the
DiffSinger Community**, licensed under
[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/).
See the [upstream vocoder page](https://openvpi.github.io/vocoders/) for attribution,
contributors, and integration conditions, and retain the voicebank's
`dsvocoder/NOTICE.txt` when distributing those weights. Follow the license's
attribution, non-commercial, and share-alike conditions for the weights.

The upstream page states that commercial audio production is not constrained by
the vocoder license. It specifies disclosures and attribution before purchase or
subscription when shipping or automatically downloading the vocoder in a
commercial product. These provisions do not waive LIEE's separate restrictions.

## Packaging and redistribution

Model files and the original archive remain in the ignored `models/` directory;
they are not part of the MIT source distribution. Preserve original notices in
local installations. Before bundling models into archives, containers, releases,
or services, establish the necessary permissions and include all required
licenses and notices. Do not label a bundle containing third-party models as
wholly MIT-licensed. Other software dependencies retain their respective licenses.
