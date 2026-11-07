/**
 * Sections (ADR-0009) are switched off in the UI for now: a topic shows one flat list of lessons,
 * and new lessons are created without a section. The data model and the API keep the section
 * field; flip this back to true to bring the section UI back.
 */
export const SECTIONS_ENABLED = false;
