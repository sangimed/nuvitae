import {
  nuvitaeSemanticExtractionResponseVersion,
  type NuvitaeSemanticExtractionResponse,
} from "@nuvitae/contracts";
import { deterministicFixtureProfiles } from "@nuvitae/import-application/testing";

import {
  fixtureEvidenceOf,
  fixtureFragmentAt,
  fixtureSemanticValueOf,
  semanticParserFixtureIds,
  semanticParserFixtureInputs,
  type SemanticParserFixtureId,
  type SemanticParserFixtureInput,
  type SemanticParserSourceFragment,
} from "./semantic-parser-fixtures.js";

/**
 * Exact provider-neutral expected semantic JSON for every fixture in the
 * T169 corpus.
 *
 * Every expected response is contract-valid, every non-null value is the
 * exact evidenced substring of a canonical flattened fragment, absent values
 * use explicit nulls, absent collections use `[]`, and no value is invented.
 * The two English single-column fixtures reuse the T210 deterministic-provider
 * responses byte-for-byte so the corpus cannot drift from T210.
 */

function t210ProfileResponse(
  profileId: "pdf-english-anonymous" | "docx-english-anonymous",
): NuvitaeSemanticExtractionResponse {
  const profile = deterministicFixtureProfiles.find(
    (candidate) => candidate.profileId === profileId,
  );
  if (profile === undefined) {
    throw new Error(`Missing T210 fixture profile "${profileId}".`);
  }
  return profile.response;
}

function fragmentsOf(
  fixtureId: SemanticParserFixtureId,
): readonly SemanticParserSourceFragment[] {
  return semanticParserFixtureInputs[fixtureId].fragments;
}

function buildPdfFrenchResponse(
  fragments: readonly SemanticParserSourceFragment[],
): NuvitaeSemanticExtractionResponse {
  const name = fixtureFragmentAt(fragments, 0);
  const email = fixtureFragmentAt(fragments, 1);
  const location = fixtureFragmentAt(fragments, 2);
  const phone = fixtureFragmentAt(fragments, 3);
  const headline = fixtureFragmentAt(fragments, 4);
  const summary = fixtureFragmentAt(fragments, 6);
  const employer = fixtureFragmentAt(fragments, 8);
  const seniorRole = fixtureFragmentAt(fragments, 9);
  const seniorDates = fixtureFragmentAt(fragments, 10);
  const seniorResponsibility = fixtureFragmentAt(fragments, 11);
  const engineerRole = fixtureFragmentAt(fragments, 12);
  const engineerDates = fixtureFragmentAt(fragments, 13);
  const engineerResponsibility = fixtureFragmentAt(fragments, 14);
  const degree = fixtureFragmentAt(fragments, 16);
  const institution = fixtureFragmentAt(fragments, 17);
  const educationDates = fixtureFragmentAt(fragments, 18);
  const skillsLine = fixtureFragmentAt(fragments, 20);
  const languagesLine = fixtureFragmentAt(fragments, 22);
  const certificationName = fixtureFragmentAt(fragments, 24);
  const certificationDate = fixtureFragmentAt(fragments, 25);
  const link = fixtureFragmentAt(fragments, 27);
  const projectName = fixtureFragmentAt(fragments, 29);

  return {
    schemaVersion: nuvitaeSemanticExtractionResponseVersion,
    documentLanguage: {
      value: "french",
      confidence: "high",
      evidence: [fixtureEvidenceOf(languagesLine, "Français")],
    },
    sections: {
      contact: {
        fullName: fixtureSemanticValueOf(name, "Élodie Marchand"),
        email: fixtureSemanticValueOf(email, "elodie.marchand@example.test"),
        phone: fixtureSemanticValueOf(phone, "+33 4 72 10 20 30"),
        location: fixtureSemanticValueOf(location, "Lyon, France"),
        website: null,
      },
      headline: fixtureSemanticValueOf(
        headline,
        "Ingénieure logicielle senior",
      ),
      summary: fixtureSemanticValueOf(
        summary,
        "Développeuse backend avec huit ans d'expérience en systèmes distribués.",
      ),
      workExperience: [
        {
          candidateId: "work-1",
          employerName: fixtureSemanticValueOf(
            employer,
            "BlueWave Technologies",
          ),
          employerLocation: null,
          roles: [
            {
              candidateId: "role-1",
              title: fixtureSemanticValueOf(
                seniorRole,
                "Ingénieure logicielle senior",
              ),
              location: null,
              startDate: fixtureSemanticValueOf(seniorDates, "2021"),
              endDate: null,
              isOngoing: true,
              responsibilities: [
                fixtureSemanticValueOf(
                  seniorResponsibility,
                  "Encadre l'équipe plateforme de paiement composée de six ingénieurs.",
                ),
              ],
              achievements: [],
            },
            {
              candidateId: "role-2",
              title: fixtureSemanticValueOf(
                engineerRole,
                "Ingénieure logicielle",
              ),
              location: null,
              startDate: fixtureSemanticValueOf(engineerDates, "2018"),
              endDate: fixtureSemanticValueOf(engineerDates, "2021"),
              isOngoing: false,
              responsibilities: [
                fixtureSemanticValueOf(
                  engineerResponsibility,
                  "Développe et exploite le service de notifications clients.",
                ),
              ],
              achievements: [],
            },
          ],
        },
      ],
      education: [
        {
          candidateId: "education-1",
          institution: fixtureSemanticValueOf(
            institution,
            "Institut Polytechnique des Sciences",
          ),
          degree: fixtureSemanticValueOf(degree, "Master en informatique"),
          fieldOfStudy: null,
          startDate: fixtureSemanticValueOf(educationDates, "2013"),
          endDate: fixtureSemanticValueOf(educationDates, "2018"),
          location: null,
          details: [],
        },
      ],
      skills: [
        {
          candidateId: "skill-1",
          name: fixtureSemanticValueOf(skillsLine, "TypeScript"),
          category: null,
        },
        {
          candidateId: "skill-2",
          name: fixtureSemanticValueOf(skillsLine, "Node.js"),
          category: null,
        },
        {
          candidateId: "skill-3",
          name: fixtureSemanticValueOf(skillsLine, "PostgreSQL"),
          category: null,
        },
        {
          candidateId: "skill-4",
          name: fixtureSemanticValueOf(skillsLine, "Kubernetes"),
          category: null,
        },
      ],
      languages: [
        {
          candidateId: "language-1",
          name: fixtureSemanticValueOf(languagesLine, "Français"),
          proficiency: fixtureSemanticValueOf(languagesLine, "natif"),
        },
        {
          candidateId: "language-2",
          name: fixtureSemanticValueOf(languagesLine, "Anglais"),
          proficiency: fixtureSemanticValueOf(languagesLine, "professionnel"),
        },
      ],
      projects: [
        {
          candidateId: "project-1",
          name: fixtureSemanticValueOf(
            projectName,
            "Outil open source de génération de rapports",
          ),
          description: null,
          technologies: [],
          links: [],
        },
      ],
      certifications: [
        {
          candidateId: "certification-1",
          name: fixtureSemanticValueOf(
            certificationName,
            "Certification en architecture cloud",
          ),
          issuer: null,
          date: fixtureSemanticValueOf(certificationDate, "2022"),
        },
      ],
      professionalLinks: [
        fixtureSemanticValueOf(link, "https://portfolio.example.test"),
      ],
    },
    relationships: [
      {
        candidateId: "relationship-1",
        relationshipType: "role_belongs_to_employer",
        fromCandidateId: "role-1",
        toCandidateId: "work-1",
        evidence: [
          fixtureEvidenceOf(employer, "BlueWave Technologies"),
          fixtureEvidenceOf(seniorRole, "Ingénieure logicielle senior"),
        ],
        confidence: "high",
      },
      {
        candidateId: "relationship-2",
        relationshipType: "role_belongs_to_employer",
        fromCandidateId: "role-2",
        toCandidateId: "work-1",
        evidence: [
          fixtureEvidenceOf(employer, "BlueWave Technologies"),
          fixtureEvidenceOf(engineerRole, "Ingénieure logicielle"),
        ],
        confidence: "high",
      },
    ],
    ambiguityDiagnostics: [],
    conflictDiagnostics: [],
    privacyWarnings: [],
  };
}

/**
 * Expected semantic JSON for the canonical real-document French PDF fixture
 * (`pdf-french-canonical-anonymous`, T248). Every non-null value is an exact
 * evidenced substring of the deterministic extraction transcript pinned to
 * `tests/fixtures/resumes/anonymous-french-resume.pdf`. The document-level
 * language confidence mirrors the repository's deterministic classifier
 * result for that fixture ("medium"), and the quoted "Résilience
 * opérationnelle" claim is surfaced as an ambiguity diagnostic because the
 * fixture explicitly states it appears without a defined scope.
 */
function buildPdfFrenchCanonicalResponse(
  fragments: readonly SemanticParserSourceFragment[],
): NuvitaeSemanticExtractionResponse {
  const name = fixtureFragmentAt(fragments, 0);
  const headline = fixtureFragmentAt(fragments, 1);
  const email = fixtureFragmentAt(fragments, 2);
  const location = fixtureFragmentAt(fragments, 3);
  const summary = fixtureFragmentAt(fragments, 5);
  const employer = fixtureFragmentAt(fragments, 7);
  const role = fixtureFragmentAt(fragments, 8);
  const dates = fixtureFragmentAt(fragments, 9);
  const firstResponsibility = fixtureFragmentAt(fragments, 10);
  const secondResponsibility = fixtureFragmentAt(fragments, 11);
  const ambiguousClaim = fixtureFragmentAt(fragments, 12);
  const institution = fixtureFragmentAt(fragments, 14);
  const degree = fixtureFragmentAt(fragments, 15);
  const educationDates = fixtureFragmentAt(fragments, 16);
  const skillsLine = fixtureFragmentAt(fragments, 17);
  const languagesLine = fixtureFragmentAt(fragments, 18);
  const certificationLine = fixtureFragmentAt(fragments, 19);

  return {
    schemaVersion: nuvitaeSemanticExtractionResponseVersion,
    documentLanguage: {
      value: "french",
      confidence: "medium",
      evidence: [fixtureEvidenceOf(languagesLine, "Français")],
    },
    sections: {
      contact: {
        fullName: fixtureSemanticValueOf(name, "Léa Dupont-Exemple"),
        email: fixtureSemanticValueOf(email, "lea.exemple@example.invalid"),
        phone: null,
        location: fixtureSemanticValueOf(location, "Nantes, France"),
        website: null,
      },
      headline: fixtureSemanticValueOf(headline, "Ingénieure Systèmes"),
      summary: fixtureSemanticValueOf(
        summary,
        "Ingénieure systèmes qui simplifie des processus d'approbation fictifs.",
      ),
      workExperience: [
        {
          candidateId: "work-1",
          employerName: fixtureSemanticValueOf(
            employer,
            "Atelier Fictif Lumière (employeur fictif)",
          ),
          employerLocation: null,
          roles: [
            {
              candidateId: "role-1",
              title: fixtureSemanticValueOf(role, "Ingénieure Systèmes"),
              location: null,
              startDate: fixtureSemanticValueOf(dates, "avril 2022"),
              endDate: fixtureSemanticValueOf(dates, "décembre 2024"),
              isOngoing: false,
              responsibilities: [
                fixtureSemanticValueOf(
                  firstResponsibility,
                  "A cartographié 18 parcours d'approbation fictifs.",
                ),
                fixtureSemanticValueOf(
                  secondResponsibility,
                  "A écrit des vérifications JSON pour 300 enregistrements fictifs.",
                ),
              ],
              achievements: [],
            },
          ],
        },
      ],
      education: [
        {
          candidateId: "education-1",
          institution: fixtureSemanticValueOf(
            institution,
            "Institut de Design Fictif",
          ),
          degree: fixtureSemanticValueOf(
            degree,
            "Diplôme en Design de Systèmes",
          ),
          fieldOfStudy: null,
          startDate: fixtureSemanticValueOf(educationDates, "2019"),
          endDate: fixtureSemanticValueOf(educationDates, "2022"),
          location: null,
          details: [],
        },
      ],
      skills: [
        {
          candidateId: "skill-1",
          name: fixtureSemanticValueOf(skillsLine, "JSON"),
          category: null,
        },
        {
          candidateId: "skill-2",
          name: fixtureSemanticValueOf(skillsLine, "Cartographie"),
          category: null,
        },
        {
          candidateId: "skill-3",
          name: fixtureSemanticValueOf(skillsLine, "Tests"),
          category: null,
        },
      ],
      languages: [
        {
          candidateId: "language-1",
          name: fixtureSemanticValueOf(languagesLine, "Français"),
          proficiency: fixtureSemanticValueOf(languagesLine, "courant"),
        },
        {
          candidateId: "language-2",
          name: fixtureSemanticValueOf(languagesLine, "Anglais"),
          proficiency: fixtureSemanticValueOf(languagesLine, "professionnel"),
        },
      ],
      projects: [],
      certifications: [
        {
          candidateId: "certification-1",
          name: fixtureSemanticValueOf(
            certificationLine,
            "Médaille fictive de sécurité",
          ),
          issuer: null,
          date: fixtureSemanticValueOf(certificationLine, "2024"),
        },
      ],
      professionalLinks: [],
    },
    relationships: [
      {
        candidateId: "relationship-1",
        relationshipType: "role_belongs_to_employer",
        fromCandidateId: "role-1",
        toCandidateId: "work-1",
        evidence: [
          fixtureEvidenceOf(
            employer,
            "Atelier Fictif Lumière (employeur fictif)",
          ),
          fixtureEvidenceOf(role, "Ingénieure Systèmes"),
        ],
        confidence: "high",
      },
    ],
    ambiguityDiagnostics: [
      {
        code: "ambiguous_grouping",
        message:
          "A quoted claim appears without a defined scope and requires review.",
        severity: "warning",
        evidence: [
          fixtureEvidenceOf(ambiguousClaim, "Résilience opérationnelle"),
        ],
        safeDetail:
          "The quoted claim is listed in the experience section without a defined scope.",
      },
    ],
    conflictDiagnostics: [],
    privacyWarnings: [],
  };
}

function buildDocxFrenchResponse(
  fragments: readonly SemanticParserSourceFragment[],
): NuvitaeSemanticExtractionResponse {
  const name = fixtureFragmentAt(fragments, 0);
  const email = fixtureFragmentAt(fragments, 1);
  const location = fixtureFragmentAt(fragments, 2);
  const headline = fixtureFragmentAt(fragments, 3);
  const summary = fixtureFragmentAt(fragments, 5);
  const atelier = fixtureFragmentAt(fragments, 7);
  const productRole = fixtureFragmentAt(fragments, 8);
  const ambiguousDates = fixtureFragmentAt(fragments, 9);
  const productResponsibility = fixtureFragmentAt(fragments, 10);
  const studio = fixtureFragmentAt(fragments, 11);
  const ownerRole = fixtureFragmentAt(fragments, 12);
  const ownerDates = fixtureFragmentAt(fragments, 13);
  const ownerResponsibility = fixtureFragmentAt(fragments, 14);
  const degree = fixtureFragmentAt(fragments, 16);
  const institution = fixtureFragmentAt(fragments, 17);
  const educationDates = fixtureFragmentAt(fragments, 18);
  const skillsLine = fixtureFragmentAt(fragments, 20);
  const languagesLine = fixtureFragmentAt(fragments, 22);
  const certificationName = fixtureFragmentAt(fragments, 24);
  const certificationDate = fixtureFragmentAt(fragments, 25);
  const link = fixtureFragmentAt(fragments, 27);

  return {
    schemaVersion: nuvitaeSemanticExtractionResponseVersion,
    documentLanguage: {
      value: "french",
      confidence: "high",
      evidence: [fixtureEvidenceOf(languagesLine, "Français")],
    },
    sections: {
      contact: {
        fullName: fixtureSemanticValueOf(name, "Julien Lefèvre"),
        email: fixtureSemanticValueOf(email, "julien.lefevre@example.test"),
        phone: null,
        location: fixtureSemanticValueOf(location, "Nantes, France"),
        website: null,
      },
      headline: fixtureSemanticValueOf(headline, "Chef de projet produit"),
      summary: fixtureSemanticValueOf(
        summary,
        "Chef de projet produit orienté design thinking et méthodes agiles.",
      ),
      workExperience: [
        {
          candidateId: "work-1",
          employerName: fixtureSemanticValueOf(atelier, "Atelier Nord"),
          employerLocation: null,
          roles: [
            {
              candidateId: "role-1",
              title: fixtureSemanticValueOf(
                productRole,
                "Chef de projet produit",
              ),
              location: null,
              startDate: fixtureSemanticValueOf(ambiguousDates, "2019"),
              endDate: null,
              isOngoing: null,
              responsibilities: [
                fixtureSemanticValueOf(
                  productResponsibility,
                  "Coordonne trois équipes produit et les rituels de cadence.",
                ),
              ],
              achievements: [],
            },
          ],
        },
        {
          candidateId: "work-2",
          employerName: fixtureSemanticValueOf(studio, "Studio Lumière"),
          employerLocation: null,
          roles: [
            {
              candidateId: "role-2",
              title: fixtureSemanticValueOf(ownerRole, "Product Owner"),
              location: null,
              startDate: fixtureSemanticValueOf(ownerDates, "2022"),
              endDate: null,
              isOngoing: true,
              responsibilities: [
                fixtureSemanticValueOf(
                  ownerResponsibility,
                  "Définit la feuille de route du portefeuille mobile.",
                ),
              ],
              achievements: [],
            },
          ],
        },
      ],
      education: [
        {
          candidateId: "education-1",
          institution: fixtureSemanticValueOf(
            institution,
            "Institut Européen de Gestion",
          ),
          degree: fixtureSemanticValueOf(
            degree,
            "Master en management de projet",
          ),
          fieldOfStudy: null,
          startDate: fixtureSemanticValueOf(educationDates, "2014"),
          endDate: fixtureSemanticValueOf(educationDates, "2018"),
          location: null,
          details: [],
        },
      ],
      skills: [
        {
          candidateId: "skill-1",
          name: fixtureSemanticValueOf(skillsLine, "Gestion de produit"),
          category: null,
        },
        {
          candidateId: "skill-2",
          name: fixtureSemanticValueOf(skillsLine, "Méthodes agiles"),
          category: null,
        },
        {
          candidateId: "skill-3",
          name: fixtureSemanticValueOf(skillsLine, "Analyse de données"),
          category: null,
        },
      ],
      languages: [
        {
          candidateId: "language-1",
          name: fixtureSemanticValueOf(languagesLine, "Français"),
          proficiency: fixtureSemanticValueOf(languagesLine, "natif"),
        },
        {
          candidateId: "language-2",
          name: fixtureSemanticValueOf(languagesLine, "Anglais"),
          proficiency: fixtureSemanticValueOf(languagesLine, "courant"),
        },
      ],
      projects: [],
      certifications: [
        {
          candidateId: "certification-1",
          name: fixtureSemanticValueOf(
            certificationName,
            "Certification en gestion de produit",
          ),
          issuer: null,
          date: fixtureSemanticValueOf(certificationDate, "2021"),
        },
      ],
      professionalLinks: [
        fixtureSemanticValueOf(link, "https://cv-lefevre.example.test"),
      ],
    },
    relationships: [
      {
        candidateId: "relationship-1",
        relationshipType: "role_belongs_to_employer",
        fromCandidateId: "role-1",
        toCandidateId: "work-1",
        evidence: [
          fixtureEvidenceOf(atelier, "Atelier Nord"),
          fixtureEvidenceOf(productRole, "Chef de projet produit"),
        ],
        confidence: "high",
      },
      {
        candidateId: "relationship-2",
        relationshipType: "role_belongs_to_employer",
        fromCandidateId: "role-2",
        toCandidateId: "work-2",
        evidence: [
          fixtureEvidenceOf(studio, "Studio Lumière"),
          fixtureEvidenceOf(ownerRole, "Product Owner"),
        ],
        confidence: "high",
      },
    ],
    ambiguityDiagnostics: [
      {
        code: "ambiguous_date",
        message: "A role start or end date is ambiguous and requires review.",
        severity: "warning",
        evidence: [fixtureEvidenceOf(ambiguousDates, "2019/2022")],
        safeDetail: "The role dates could be read as a range or a single year.",
      },
    ],
    conflictDiagnostics: [],
    privacyWarnings: [],
  };
}

function buildPdfBilingualResponse(
  fragments: readonly SemanticParserSourceFragment[],
): NuvitaeSemanticExtractionResponse {
  const name = fixtureFragmentAt(fragments, 0);
  const email = fixtureFragmentAt(fragments, 1);
  const location = fixtureFragmentAt(fragments, 2);
  const phone = fixtureFragmentAt(fragments, 3);
  const headline = fixtureFragmentAt(fragments, 4);
  const skillsLine = fixtureFragmentAt(fragments, 6);
  const languagesLine = fixtureFragmentAt(fragments, 8);
  const linkOne = fixtureFragmentAt(fragments, 10);
  const linkTwo = fixtureFragmentAt(fragments, 11);
  const summary = fixtureFragmentAt(fragments, 13);
  const employer = fixtureFragmentAt(fragments, 15);
  const seniorRole = fixtureFragmentAt(fragments, 16);
  const seniorDates = fixtureFragmentAt(fragments, 17);
  const seniorResponsibility = fixtureFragmentAt(fragments, 18);
  const productRole = fixtureFragmentAt(fragments, 19);
  const productDates = fixtureFragmentAt(fragments, 20);
  const productResponsibility = fixtureFragmentAt(fragments, 21);
  const degree = fixtureFragmentAt(fragments, 23);
  const institution = fixtureFragmentAt(fragments, 24);
  const educationDates = fixtureFragmentAt(fragments, 25);
  const projectName = fixtureFragmentAt(fragments, 27);
  const certificationName = fixtureFragmentAt(fragments, 29);
  const certificationDate = fixtureFragmentAt(fragments, 30);

  return {
    schemaVersion: nuvitaeSemanticExtractionResponseVersion,
    documentLanguage: {
      value: "bilingual_french_english",
      confidence: "high",
      evidence: [
        fixtureEvidenceOf(languagesLine, "Français"),
        fixtureEvidenceOf(languagesLine, "Anglais"),
      ],
    },
    sections: {
      contact: {
        fullName: fixtureSemanticValueOf(name, "Alex Martin"),
        email: fixtureSemanticValueOf(email, "alex.martin@example.test"),
        phone: fixtureSemanticValueOf(phone, "+33 6 98 76 54 32"),
        location: fixtureSemanticValueOf(location, "Paris, France"),
        website: null,
      },
      headline: fixtureSemanticValueOf(
        headline,
        "Ingénieur produit / Product Engineer",
      ),
      summary: fixtureSemanticValueOf(
        summary,
        "Ingénieur produit avec dix ans d'expérience en France et au Royaume-Uni.",
      ),
      workExperience: [
        {
          candidateId: "work-1",
          employerName: fixtureSemanticValueOf(employer, "Orbit Analytics"),
          employerLocation: null,
          roles: [
            {
              candidateId: "role-1",
              title: fixtureSemanticValueOf(
                seniorRole,
                "Ingénieur produit senior",
              ),
              location: null,
              startDate: fixtureSemanticValueOf(seniorDates, "2021"),
              endDate: null,
              isOngoing: true,
              responsibilities: [
                fixtureSemanticValueOf(
                  seniorResponsibility,
                  "Pilote la roadmap produit et l'adoption de la plateforme analytique.",
                ),
              ],
              achievements: [],
            },
            {
              candidateId: "role-2",
              title: fixtureSemanticValueOf(productRole, "Ingénieur produit"),
              location: null,
              startDate: fixtureSemanticValueOf(productDates, "2017"),
              endDate: fixtureSemanticValueOf(productDates, "2021"),
              isOngoing: false,
              responsibilities: [
                fixtureSemanticValueOf(
                  productResponsibility,
                  "Développe des fonctionnalités de reporting pour les équipes data.",
                ),
              ],
              achievements: [],
            },
          ],
        },
      ],
      education: [
        {
          candidateId: "education-1",
          institution: fixtureSemanticValueOf(
            institution,
            "Northbridge University",
          ),
          degree: fixtureSemanticValueOf(
            degree,
            "Master of Science in Computer Science",
          ),
          fieldOfStudy: null,
          startDate: fixtureSemanticValueOf(educationDates, "2013"),
          endDate: fixtureSemanticValueOf(educationDates, "2017"),
          location: null,
          details: [],
        },
      ],
      skills: [
        {
          candidateId: "skill-1",
          name: fixtureSemanticValueOf(skillsLine, "TypeScript"),
          category: null,
        },
        {
          candidateId: "skill-2",
          name: fixtureSemanticValueOf(skillsLine, "React"),
          category: null,
        },
        {
          candidateId: "skill-3",
          name: fixtureSemanticValueOf(skillsLine, "Python"),
          category: null,
        },
        {
          candidateId: "skill-4",
          name: fixtureSemanticValueOf(skillsLine, "AWS"),
          category: null,
        },
      ],
      languages: [
        {
          candidateId: "language-1",
          name: fixtureSemanticValueOf(languagesLine, "Français"),
          proficiency: fixtureSemanticValueOf(languagesLine, "natif"),
        },
        {
          candidateId: "language-2",
          name: fixtureSemanticValueOf(languagesLine, "Anglais"),
          proficiency: fixtureSemanticValueOf(languagesLine, "bilingue"),
        },
      ],
      projects: [
        {
          candidateId: "project-1",
          name: fixtureSemanticValueOf(
            projectName,
            "Plateforme de visualisation open source",
          ),
          description: null,
          technologies: [],
          links: [],
        },
      ],
      certifications: [
        {
          candidateId: "certification-1",
          name: fixtureSemanticValueOf(
            certificationName,
            "Cloud Architecture Certification",
          ),
          issuer: null,
          date: fixtureSemanticValueOf(certificationDate, "2020"),
        },
      ],
      professionalLinks: [
        fixtureSemanticValueOf(
          linkOne,
          "https://github.com/alex-martin-example",
        ),
        fixtureSemanticValueOf(
          linkTwo,
          "https://portfolio-alexmartin.example.test",
        ),
      ],
    },
    relationships: [
      {
        candidateId: "relationship-1",
        relationshipType: "role_belongs_to_employer",
        fromCandidateId: "role-1",
        toCandidateId: "work-1",
        evidence: [
          fixtureEvidenceOf(employer, "Orbit Analytics"),
          fixtureEvidenceOf(seniorRole, "Ingénieur produit senior"),
        ],
        confidence: "high",
      },
      {
        candidateId: "relationship-2",
        relationshipType: "role_belongs_to_employer",
        fromCandidateId: "role-2",
        toCandidateId: "work-1",
        evidence: [
          fixtureEvidenceOf(employer, "Orbit Analytics"),
          fixtureEvidenceOf(productRole, "Ingénieur produit"),
        ],
        confidence: "medium",
      },
    ],
    ambiguityDiagnostics: [
      {
        code: "ambiguous_grouping",
        message: "A role grouping requires review.",
        severity: "warning",
        evidence: [
          fixtureEvidenceOf(employer, "Orbit Analytics"),
          fixtureEvidenceOf(productRole, "Ingénieur produit"),
        ],
        safeDetail: "The role could belong to more than one listed employer.",
      },
    ],
    conflictDiagnostics: [],
    privacyWarnings: [],
  };
}

function buildDocxBilingualResponse(
  fragments: readonly SemanticParserSourceFragment[],
): NuvitaeSemanticExtractionResponse {
  const name = fixtureFragmentAt(fragments, 0);
  const email = fixtureFragmentAt(fragments, 1);
  const location = fixtureFragmentAt(fragments, 2);
  const headline = fixtureFragmentAt(fragments, 3);
  const summary = fixtureFragmentAt(fragments, 5);
  const employer = fixtureFragmentAt(fragments, 7);
  const seniorRole = fixtureFragmentAt(fragments, 8);
  const ambiguousDates = fixtureFragmentAt(fragments, 9);
  const seniorResponsibility = fixtureFragmentAt(fragments, 10);
  const consultantRole = fixtureFragmentAt(fragments, 11);
  const consultantDates = fixtureFragmentAt(fragments, 12);
  const consultantResponsibility = fixtureFragmentAt(fragments, 13);
  const degree = fixtureFragmentAt(fragments, 15);
  const institution = fixtureFragmentAt(fragments, 16);
  const educationDates = fixtureFragmentAt(fragments, 17);
  const skillsLine = fixtureFragmentAt(fragments, 19);
  const languagesLine = fixtureFragmentAt(fragments, 21);
  const certificationName = fixtureFragmentAt(fragments, 23);
  const certificationDate = fixtureFragmentAt(fragments, 24);
  const link = fixtureFragmentAt(fragments, 26);
  const projectName = fixtureFragmentAt(fragments, 28);

  return {
    schemaVersion: nuvitaeSemanticExtractionResponseVersion,
    documentLanguage: {
      value: "bilingual_french_english",
      confidence: "high",
      evidence: [
        fixtureEvidenceOf(languagesLine, "Français"),
        fixtureEvidenceOf(languagesLine, "Anglais"),
      ],
    },
    sections: {
      contact: {
        fullName: fixtureSemanticValueOf(name, "Sara Benali"),
        email: fixtureSemanticValueOf(email, "sara.benali@example.test"),
        phone: null,
        location: fixtureSemanticValueOf(location, "Bruxelles, Belgique"),
        website: null,
      },
      headline: fixtureSemanticValueOf(
        headline,
        "Consultante data / Data Consultant",
      ),
      summary: fixtureSemanticValueOf(
        summary,
        "Consultante data spécialisée en visualisation et en gouvernance des données. / Data consultant specialized in visualization and data governance.",
      ),
      workExperience: [
        {
          candidateId: "work-1",
          employerName: fixtureSemanticValueOf(employer, "DataViz Studio"),
          employerLocation: null,
          roles: [
            {
              candidateId: "role-1",
              title: fixtureSemanticValueOf(
                seniorRole,
                "Consultante data senior",
              ),
              location: null,
              startDate: fixtureSemanticValueOf(ambiguousDates, "2020"),
              endDate: null,
              isOngoing: null,
              responsibilities: [
                fixtureSemanticValueOf(
                  seniorResponsibility,
                  "Construit des tableaux de bord pour des équipes financières. / Builds dashboards for finance teams.",
                ),
              ],
              achievements: [],
            },
            {
              candidateId: "role-2",
              title: fixtureSemanticValueOf(consultantRole, "Consultante data"),
              location: null,
              startDate: fixtureSemanticValueOf(consultantDates, "2017"),
              endDate: fixtureSemanticValueOf(consultantDates, "2020"),
              isOngoing: false,
              responsibilities: [
                fixtureSemanticValueOf(
                  consultantResponsibility,
                  "Automatise les rapports de reporting mensuels. / Automates monthly reporting pipelines.",
                ),
              ],
              achievements: [],
            },
          ],
        },
      ],
      education: [
        {
          candidateId: "education-1",
          institution: fixtureSemanticValueOf(
            institution,
            "Université du Nord-Est",
          ),
          degree: fixtureSemanticValueOf(
            degree,
            "Master en statistiques / Master of Science in Statistics",
          ),
          fieldOfStudy: null,
          startDate: fixtureSemanticValueOf(educationDates, "2013"),
          endDate: fixtureSemanticValueOf(educationDates, "2017"),
          location: null,
          details: [],
        },
      ],
      skills: [
        {
          candidateId: "skill-1",
          name: fixtureSemanticValueOf(skillsLine, "SQL"),
          category: null,
        },
        {
          candidateId: "skill-2",
          name: fixtureSemanticValueOf(skillsLine, "Python"),
          category: null,
        },
        {
          candidateId: "skill-3",
          name: fixtureSemanticValueOf(skillsLine, "Tableau"),
          category: null,
        },
        {
          candidateId: "skill-4",
          name: fixtureSemanticValueOf(skillsLine, "dbt"),
          category: null,
        },
      ],
      languages: [
        {
          candidateId: "language-1",
          name: fixtureSemanticValueOf(languagesLine, "Français"),
          proficiency: fixtureSemanticValueOf(languagesLine, "natif"),
        },
        {
          candidateId: "language-2",
          name: fixtureSemanticValueOf(languagesLine, "Anglais"),
          proficiency: fixtureSemanticValueOf(languagesLine, "professionnel"),
        },
        {
          candidateId: "language-3",
          name: fixtureSemanticValueOf(languagesLine, "Néerlandais"),
          proficiency: fixtureSemanticValueOf(languagesLine, "intermédiaire"),
        },
      ],
      projects: [
        {
          candidateId: "project-1",
          name: fixtureSemanticValueOf(
            projectName,
            "Atlas des données ouvertes",
          ),
          description: null,
          technologies: [],
          links: [],
        },
      ],
      certifications: [
        {
          candidateId: "certification-1",
          name: fixtureSemanticValueOf(
            certificationName,
            "Certification en gouvernance des données",
          ),
          issuer: null,
          date: fixtureSemanticValueOf(certificationDate, "2021"),
        },
      ],
      professionalLinks: [
        fixtureSemanticValueOf(
          link,
          "https://www.example.test/sara-benali-data",
        ),
      ],
    },
    relationships: [
      {
        candidateId: "relationship-1",
        relationshipType: "role_belongs_to_employer",
        fromCandidateId: "role-1",
        toCandidateId: "work-1",
        evidence: [
          fixtureEvidenceOf(employer, "DataViz Studio"),
          fixtureEvidenceOf(seniorRole, "Consultante data senior"),
        ],
        confidence: "high",
      },
      {
        candidateId: "relationship-2",
        relationshipType: "role_belongs_to_employer",
        fromCandidateId: "role-2",
        toCandidateId: "work-1",
        evidence: [
          fixtureEvidenceOf(employer, "DataViz Studio"),
          fixtureEvidenceOf(consultantRole, "Consultante data"),
        ],
        confidence: "high",
      },
    ],
    ambiguityDiagnostics: [
      {
        code: "ambiguous_date",
        message: "A role start or end date is ambiguous and requires review.",
        severity: "warning",
        evidence: [fixtureEvidenceOf(ambiguousDates, "2020/2024")],
        safeDetail: "The role dates could be read as a range or a single year.",
      },
    ],
    conflictDiagnostics: [],
    privacyWarnings: [],
  };
}

function buildPdfEnglishMultiColumnResponse(
  fragments: readonly SemanticParserSourceFragment[],
): NuvitaeSemanticExtractionResponse {
  const name = fixtureFragmentAt(fragments, 0);
  const email = fixtureFragmentAt(fragments, 1);
  const location = fixtureFragmentAt(fragments, 2);
  const headline = fixtureFragmentAt(fragments, 3);
  const summary = fixtureFragmentAt(fragments, 5);
  const coreStream = fixtureFragmentAt(fragments, 7);
  const seniorRole = fixtureFragmentAt(fragments, 8);
  const seniorDates = fixtureFragmentAt(fragments, 9);
  const seniorResponsibility = fixtureFragmentAt(fragments, 10);
  const dataEngineerRole = fixtureFragmentAt(fragments, 11);
  const dataEngineerDates = fixtureFragmentAt(fragments, 12);
  const dataEngineerResponsibility = fixtureFragmentAt(fragments, 13);
  const brightAnalytics = fixtureFragmentAt(fragments, 14);
  const analystRole = fixtureFragmentAt(fragments, 15);
  const analystDates = fixtureFragmentAt(fragments, 16);
  const analystResponsibility = fixtureFragmentAt(fragments, 17);
  const degree = fixtureFragmentAt(fragments, 19);
  const institution = fixtureFragmentAt(fragments, 20);
  const educationDates = fixtureFragmentAt(fragments, 21);
  const skillsLine = fixtureFragmentAt(fragments, 23);
  const languagesLine = fixtureFragmentAt(fragments, 25);
  const certificationName = fixtureFragmentAt(fragments, 27);
  const certificationDate = fixtureFragmentAt(fragments, 28);
  const link = fixtureFragmentAt(fragments, 30);
  const projectName = fixtureFragmentAt(fragments, 32);

  return {
    schemaVersion: nuvitaeSemanticExtractionResponseVersion,
    documentLanguage: {
      value: "english",
      confidence: "high",
      evidence: [fixtureEvidenceOf(languagesLine, "English")],
    },
    sections: {
      contact: {
        fullName: fixtureSemanticValueOf(name, "Daniel Brooks"),
        email: fixtureSemanticValueOf(email, "daniel.brooks@example.test"),
        phone: null,
        location: fixtureSemanticValueOf(location, "London, United Kingdom"),
        website: null,
      },
      headline: fixtureSemanticValueOf(headline, "Data Platform Engineer"),
      summary: fixtureSemanticValueOf(
        summary,
        "Data platform engineer focused on reliable streaming infrastructure.",
      ),
      workExperience: [
        {
          candidateId: "work-1",
          employerName: fixtureSemanticValueOf(
            coreStream,
            "CoreStream Technologies",
          ),
          employerLocation: null,
          roles: [
            {
              candidateId: "role-1",
              title: fixtureSemanticValueOf(seniorRole, "Senior Data Engineer"),
              location: null,
              startDate: fixtureSemanticValueOf(seniorDates, "2019"),
              endDate: null,
              isOngoing: true,
              responsibilities: [
                fixtureSemanticValueOf(
                  seniorResponsibility,
                  "Lead the streaming platform team of five engineers.",
                ),
              ],
              achievements: [],
            },
            {
              candidateId: "role-2",
              title: fixtureSemanticValueOf(dataEngineerRole, "Data Engineer"),
              location: null,
              startDate: fixtureSemanticValueOf(dataEngineerDates, "2016"),
              endDate: fixtureSemanticValueOf(dataEngineerDates, "2019"),
              isOngoing: false,
              responsibilities: [
                fixtureSemanticValueOf(
                  dataEngineerResponsibility,
                  "Built and operated the batch analytics pipeline.",
                ),
              ],
              achievements: [],
            },
          ],
        },
        {
          candidateId: "work-2",
          employerName: fixtureSemanticValueOf(
            brightAnalytics,
            "Bright Analytics",
          ),
          employerLocation: null,
          roles: [
            {
              candidateId: "role-3",
              title: fixtureSemanticValueOf(analystRole, "Data Analyst"),
              location: null,
              startDate: fixtureSemanticValueOf(analystDates, "2014"),
              endDate: fixtureSemanticValueOf(analystDates, "2016"),
              isOngoing: false,
              responsibilities: [
                fixtureSemanticValueOf(
                  analystResponsibility,
                  "Supported BI reporting for the growth team.",
                ),
              ],
              achievements: [],
            },
          ],
        },
      ],
      education: [
        {
          candidateId: "education-1",
          institution: fixtureSemanticValueOf(
            institution,
            "Northbridge University",
          ),
          degree: fixtureSemanticValueOf(degree, "BSc Computer Science"),
          fieldOfStudy: null,
          startDate: fixtureSemanticValueOf(educationDates, "2012"),
          endDate: fixtureSemanticValueOf(educationDates, "2016"),
          location: null,
          details: [],
        },
      ],
      skills: [
        {
          candidateId: "skill-1",
          name: fixtureSemanticValueOf(skillsLine, "Python"),
          category: null,
        },
        {
          candidateId: "skill-2",
          name: fixtureSemanticValueOf(skillsLine, "Kafka"),
          category: null,
        },
        {
          candidateId: "skill-3",
          name: fixtureSemanticValueOf(skillsLine, "Spark"),
          category: null,
        },
        {
          candidateId: "skill-4",
          name: fixtureSemanticValueOf(skillsLine, "Terraform"),
          category: null,
        },
      ],
      languages: [
        {
          candidateId: "language-1",
          name: fixtureSemanticValueOf(languagesLine, "English"),
          proficiency: fixtureSemanticValueOf(languagesLine, "native"),
        },
        {
          candidateId: "language-2",
          name: fixtureSemanticValueOf(languagesLine, "French"),
          proficiency: fixtureSemanticValueOf(languagesLine, "conversational"),
        },
      ],
      projects: [
        {
          candidateId: "project-1",
          name: fixtureSemanticValueOf(
            projectName,
            "Streaming metrics dashboard",
          ),
          description: null,
          technologies: [],
          links: [],
        },
      ],
      certifications: [
        {
          candidateId: "certification-1",
          name: fixtureSemanticValueOf(
            certificationName,
            "Cloud Architecture Certification",
          ),
          issuer: null,
          date: fixtureSemanticValueOf(certificationDate, "2021"),
        },
      ],
      professionalLinks: [
        fixtureSemanticValueOf(
          link,
          "https://github.com/daniel-brooks-example",
        ),
      ],
    },
    relationships: [
      {
        candidateId: "relationship-1",
        relationshipType: "role_belongs_to_employer",
        fromCandidateId: "role-1",
        toCandidateId: "work-1",
        evidence: [
          fixtureEvidenceOf(coreStream, "CoreStream Technologies"),
          fixtureEvidenceOf(seniorRole, "Senior Data Engineer"),
        ],
        confidence: "high",
      },
      {
        candidateId: "relationship-2",
        relationshipType: "role_belongs_to_employer",
        fromCandidateId: "role-2",
        toCandidateId: "work-1",
        evidence: [
          fixtureEvidenceOf(coreStream, "CoreStream Technologies"),
          fixtureEvidenceOf(dataEngineerRole, "Data Engineer"),
        ],
        confidence: "medium",
      },
      {
        candidateId: "relationship-3",
        relationshipType: "role_belongs_to_employer",
        fromCandidateId: "role-3",
        toCandidateId: "work-2",
        evidence: [
          fixtureEvidenceOf(brightAnalytics, "Bright Analytics"),
          fixtureEvidenceOf(analystRole, "Data Analyst"),
        ],
        confidence: "high",
      },
    ],
    ambiguityDiagnostics: [
      {
        code: "ambiguous_role_association",
        message: "A role-to-employer association requires review.",
        severity: "warning",
        evidence: [
          fixtureEvidenceOf(dataEngineerRole, "Data Engineer"),
          fixtureEvidenceOf(coreStream, "CoreStream Technologies"),
        ],
        safeDetail: "The role could be associated with more than one employer.",
      },
    ],
    conflictDiagnostics: [],
    privacyWarnings: [],
  };
}

function buildDocxFrenchMultiColumnResponse(
  fragments: readonly SemanticParserSourceFragment[],
): NuvitaeSemanticExtractionResponse {
  const name = fixtureFragmentAt(fragments, 0);
  const email = fixtureFragmentAt(fragments, 1);
  const location = fixtureFragmentAt(fragments, 2);
  const phone = fixtureFragmentAt(fragments, 3);
  const headline = fixtureFragmentAt(fragments, 4);
  const summary = fixtureFragmentAt(fragments, 6);
  const employer = fixtureFragmentAt(fragments, 8);
  const seniorRole = fixtureFragmentAt(fragments, 9);
  const ambiguousDates = fixtureFragmentAt(fragments, 10);
  const seniorResponsibility = fixtureFragmentAt(fragments, 11);
  const consultantRole = fixtureFragmentAt(fragments, 12);
  const consultantDates = fixtureFragmentAt(fragments, 13);
  const consultantResponsibility = fixtureFragmentAt(fragments, 14);
  const degree = fixtureFragmentAt(fragments, 16);
  const institution = fixtureFragmentAt(fragments, 17);
  const educationDates = fixtureFragmentAt(fragments, 18);
  const skillsLine = fixtureFragmentAt(fragments, 20);
  const languagesLine = fixtureFragmentAt(fragments, 22);
  const certificationName = fixtureFragmentAt(fragments, 24);
  const certificationDate = fixtureFragmentAt(fragments, 25);
  const link = fixtureFragmentAt(fragments, 27);
  const projectName = fixtureFragmentAt(fragments, 29);

  return {
    schemaVersion: nuvitaeSemanticExtractionResponseVersion,
    documentLanguage: {
      value: "french",
      confidence: "high",
      evidence: [fixtureEvidenceOf(languagesLine, "Français")],
    },
    sections: {
      contact: {
        fullName: fixtureSemanticValueOf(name, "Claire Fontaine"),
        email: fixtureSemanticValueOf(email, "claire.fontaine@example.test"),
        phone: fixtureSemanticValueOf(phone, "+41 22 555 01 23"),
        location: fixtureSemanticValueOf(location, "Genève, Suisse"),
        website: null,
      },
      headline: fixtureSemanticValueOf(
        headline,
        "Consultante en stratégie digitale",
      ),
      summary: fixtureSemanticValueOf(
        summary,
        "Consultante en stratégie digitale spécialisée en transformation des organisations.",
      ),
      workExperience: [
        {
          candidateId: "work-1",
          employerName: fixtureSemanticValueOf(employer, "Atlas Consulting"),
          employerLocation: null,
          roles: [
            {
              candidateId: "role-1",
              title: fixtureSemanticValueOf(seniorRole, "Consultante senior"),
              location: null,
              startDate: fixtureSemanticValueOf(ambiguousDates, "2018"),
              endDate: null,
              isOngoing: null,
              responsibilities: [
                fixtureSemanticValueOf(
                  seniorResponsibility,
                  "Accompagne des organisations dans leur transformation digitale.",
                ),
              ],
              achievements: [],
            },
            {
              candidateId: "role-2",
              title: fixtureSemanticValueOf(consultantRole, "Consultante"),
              location: null,
              startDate: fixtureSemanticValueOf(consultantDates, "2015"),
              endDate: fixtureSemanticValueOf(consultantDates, "2018"),
              isOngoing: false,
              responsibilities: [
                fixtureSemanticValueOf(
                  consultantResponsibility,
                  "Réalise des diagnostics stratégiques pour des PME.",
                ),
              ],
              achievements: [],
            },
          ],
        },
      ],
      education: [
        {
          candidateId: "education-1",
          institution: fixtureSemanticValueOf(
            institution,
            "Institut Européen de Gestion",
          ),
          degree: fixtureSemanticValueOf(
            degree,
            "Master en stratégie digitale",
          ),
          fieldOfStudy: null,
          startDate: fixtureSemanticValueOf(educationDates, "2011"),
          endDate: fixtureSemanticValueOf(educationDates, "2015"),
          location: null,
          details: [],
        },
      ],
      skills: [
        {
          candidateId: "skill-1",
          name: fixtureSemanticValueOf(skillsLine, "Stratégie"),
          category: null,
        },
        {
          candidateId: "skill-2",
          name: fixtureSemanticValueOf(skillsLine, "Transformation digitale"),
          category: null,
        },
        {
          candidateId: "skill-3",
          name: fixtureSemanticValueOf(skillsLine, "Gestion de projet"),
          category: null,
        },
      ],
      languages: [
        {
          candidateId: "language-1",
          name: fixtureSemanticValueOf(languagesLine, "Français"),
          proficiency: fixtureSemanticValueOf(languagesLine, "natif"),
        },
        {
          candidateId: "language-2",
          name: fixtureSemanticValueOf(languagesLine, "Allemand"),
          proficiency: fixtureSemanticValueOf(languagesLine, "courant"),
        },
        {
          candidateId: "language-3",
          name: fixtureSemanticValueOf(languagesLine, "Anglais"),
          proficiency: fixtureSemanticValueOf(languagesLine, "professionnel"),
        },
      ],
      projects: [
        {
          candidateId: "project-1",
          name: fixtureSemanticValueOf(
            projectName,
            "Tableau de bord de maturité digitale",
          ),
          description: null,
          technologies: [],
          links: [],
        },
      ],
      certifications: [
        {
          candidateId: "certification-1",
          name: fixtureSemanticValueOf(
            certificationName,
            "Certification en cybersécurité",
          ),
          issuer: null,
          date: fixtureSemanticValueOf(certificationDate, "2019"),
        },
      ],
      professionalLinks: [
        fixtureSemanticValueOf(
          link,
          "https://www.example.test/claire-fontaine-portfolio",
        ),
      ],
    },
    relationships: [
      {
        candidateId: "relationship-1",
        relationshipType: "role_belongs_to_employer",
        fromCandidateId: "role-1",
        toCandidateId: "work-1",
        evidence: [
          fixtureEvidenceOf(employer, "Atlas Consulting"),
          fixtureEvidenceOf(seniorRole, "Consultante senior"),
        ],
        confidence: "high",
      },
      {
        candidateId: "relationship-2",
        relationshipType: "role_belongs_to_employer",
        fromCandidateId: "role-2",
        toCandidateId: "work-1",
        evidence: [
          fixtureEvidenceOf(employer, "Atlas Consulting"),
          fixtureEvidenceOf(consultantRole, "Consultante"),
        ],
        confidence: "high",
      },
    ],
    ambiguityDiagnostics: [
      {
        code: "ambiguous_date",
        message: "A role start or end date is ambiguous and requires review.",
        severity: "warning",
        evidence: [fixtureEvidenceOf(ambiguousDates, "2018/2023")],
        safeDetail: "The role dates could be read as a range or a single year.",
      },
    ],
    conflictDiagnostics: [],
    privacyWarnings: [],
  };
}

/**
 * Expected semantic JSON for the canonical real-document bilingual PDF
 * fixture (`pdf-bilingual-canonical-anonymous`, T246-C04). Every non-null
 * value is an exact evidenced substring of the deterministic extraction
 * transcript pinned to
 * `tests/fixtures/resumes/anonymous-bilingual-resume.pdf`. Bilingual lines
 * keep both languages in one value because both halves are contiguous in the
 * same extracted fragment; the document language is classified as
 * `bilingual_french_english` with the classifier's "high" confidence.
 */
function buildPdfBilingualCanonicalResponse(
  fragments: readonly SemanticParserSourceFragment[],
): NuvitaeSemanticExtractionResponse {
  const name = fixtureFragmentAt(fragments, 0);
  const email = fixtureFragmentAt(fragments, 1);
  const location = fixtureFragmentAt(fragments, 2);
  const phone = fixtureFragmentAt(fragments, 3);
  const headline = fixtureFragmentAt(fragments, 4);
  const summary = fixtureFragmentAt(fragments, 6);
  const employer = fixtureFragmentAt(fragments, 8);
  const role = fixtureFragmentAt(fragments, 9);
  const dates = fixtureFragmentAt(fragments, 10);
  const firstResponsibility = fixtureFragmentAt(fragments, 11);
  const secondResponsibility = fixtureFragmentAt(fragments, 12);
  const degree = fixtureFragmentAt(fragments, 14);
  const institution = fixtureFragmentAt(fragments, 15);
  const educationDates = fixtureFragmentAt(fragments, 16);
  const skillsLine = fixtureFragmentAt(fragments, 18);
  const languagesLine = fixtureFragmentAt(fragments, 20);
  const projectName = fixtureFragmentAt(fragments, 22);

  return {
    schemaVersion: nuvitaeSemanticExtractionResponseVersion,
    documentLanguage: {
      value: "bilingual_french_english",
      confidence: "high",
      evidence: [fixtureEvidenceOf(languagesLine, "Français")],
    },
    sections: {
      contact: {
        fullName: fixtureSemanticValueOf(name, "Anaïs Moreau-Exemple"),
        email: fixtureSemanticValueOf(email, "anais.moreau@example.invalid"),
        phone: fixtureSemanticValueOf(phone, "+33 6 45 67 89 01"),
        location: fixtureSemanticValueOf(location, "Paris, France"),
        website: null,
      },
      headline: fixtureSemanticValueOf(
        headline,
        "Chef de projet produit bilingue / Bilingual Product Manager",
      ),
      summary: fixtureSemanticValueOf(
        summary,
        "Chef de projet avec dix ans d'expérience. / Product manager with ten years of experience.",
      ),
      workExperience: [
        {
          candidateId: "work-1",
          employerName: fixtureSemanticValueOf(
            employer,
            "Maison Exemple Nord (employeur fictif)",
          ),
          employerLocation: null,
          roles: [
            {
              candidateId: "role-1",
              title: fixtureSemanticValueOf(
                role,
                "Chef de projet produit / Product Manager",
              ),
              location: null,
              startDate: fixtureSemanticValueOf(dates, "mars 2020"),
              endDate: fixtureSemanticValueOf(dates, "aujourd'hui"),
              isOngoing: true,
              responsibilities: [
                fixtureSemanticValueOf(
                  firstResponsibility,
                  "Coordonne trois équipes produit. / Coordinates three product teams.",
                ),
                fixtureSemanticValueOf(
                  secondResponsibility,
                  "Construit la roadmap annuelle. / Builds the annual roadmap with the teams.",
                ),
              ],
              achievements: [],
            },
          ],
        },
      ],
      education: [
        {
          candidateId: "education-1",
          institution: fixtureSemanticValueOf(
            institution,
            "Université Exemple du Nord",
          ),
          degree: fixtureSemanticValueOf(
            degree,
            "Master en gestion de projet / Master of Science in Project Management",
          ),
          fieldOfStudy: null,
          startDate: fixtureSemanticValueOf(educationDates, "2014"),
          endDate: fixtureSemanticValueOf(educationDates, "2018"),
          location: null,
          details: [],
        },
      ],
      skills: [
        {
          candidateId: "skill-1",
          name: fixtureSemanticValueOf(skillsLine, "Gestion de produit"),
          category: null,
        },
        {
          candidateId: "skill-2",
          name: fixtureSemanticValueOf(skillsLine, "SQL"),
          category: null,
        },
        {
          candidateId: "skill-3",
          name: fixtureSemanticValueOf(skillsLine, "Documentation"),
          category: null,
        },
        {
          candidateId: "skill-4",
          name: fixtureSemanticValueOf(skillsLine, "Tests"),
          category: null,
        },
      ],
      languages: [
        {
          candidateId: "language-1",
          name: fixtureSemanticValueOf(languagesLine, "Français"),
          proficiency: fixtureSemanticValueOf(languagesLine, "natif"),
        },
        {
          candidateId: "language-2",
          name: fixtureSemanticValueOf(languagesLine, "Anglais"),
          proficiency: fixtureSemanticValueOf(languagesLine, "bilingue"),
        },
      ],
      projects: [
        {
          candidateId: "project-1",
          name: fixtureSemanticValueOf(
            projectName,
            "Tableau de bord open source pour les équipes data. / Open-source dashboard for data teams.",
          ),
          description: null,
          technologies: [],
          links: [],
        },
      ],
      certifications: [],
      professionalLinks: [],
    },
    relationships: [
      {
        candidateId: "relationship-1",
        relationshipType: "role_belongs_to_employer",
        fromCandidateId: "role-1",
        toCandidateId: "work-1",
        evidence: [
          fixtureEvidenceOf(employer, "Maison Exemple Nord (employeur fictif)"),
          fixtureEvidenceOf(role, "Chef de projet produit / Product Manager"),
        ],
        confidence: "high",
      },
    ],
    ambiguityDiagnostics: [],
    conflictDiagnostics: [],
    privacyWarnings: [],
  };
}

/**
 * Expected semantic JSON for the canonical real-document partial/sparse DOCX
 * fixture (`docx-partial-canonical-anonymous`, T246-C05). The document
 * intentionally omits normal CV fields; every omitted field must remain
 * `null`/absent in the expected output and no value may be invented.
 */
function buildDocxPartialCanonicalResponse(
  fragments: readonly SemanticParserSourceFragment[],
): NuvitaeSemanticExtractionResponse {
  const name = fixtureFragmentAt(fragments, 0);
  const email = fixtureFragmentAt(fragments, 1);
  const phone = fixtureFragmentAt(fragments, 2);
  const headline = fixtureFragmentAt(fragments, 3);
  const employer = fixtureFragmentAt(fragments, 5);
  const role = fixtureFragmentAt(fragments, 6);
  const dates = fixtureFragmentAt(fragments, 7);
  const responsibility = fixtureFragmentAt(fragments, 8);
  const degree = fixtureFragmentAt(fragments, 10);
  const institution = fixtureFragmentAt(fragments, 11);
  const educationDates = fixtureFragmentAt(fragments, 12);
  const skillsLine = fixtureFragmentAt(fragments, 14);
  const languagesLine = fixtureFragmentAt(fragments, 16);

  return {
    schemaVersion: nuvitaeSemanticExtractionResponseVersion,
    documentLanguage: {
      value: "english",
      confidence: "high",
      evidence: [fixtureEvidenceOf(languagesLine, "English")],
    },
    sections: {
      contact: {
        fullName: fixtureSemanticValueOf(name, "Ethan Brooks-Example"),
        email: fixtureSemanticValueOf(email, "ethan.brooks@example.invalid"),
        phone: fixtureSemanticValueOf(phone, "+1 555 010 2233"),
        location: null,
        website: null,
      },
      headline: fixtureSemanticValueOf(headline, "Support Engineer"),
      summary: null,
      workExperience: [
        {
          candidateId: "work-1",
          employerName: fixtureSemanticValueOf(employer, "Cedar Peak Systems"),
          employerLocation: null,
          roles: [
            {
              candidateId: "role-1",
              title: fixtureSemanticValueOf(role, "Support Engineer"),
              location: null,
              startDate: fixtureSemanticValueOf(dates, "2018"),
              endDate: fixtureSemanticValueOf(dates, "2023"),
              isOngoing: false,
              responsibilities: [
                fixtureSemanticValueOf(
                  responsibility,
                  "Resolved customer issues and documented solutions for the support team.",
                ),
              ],
              achievements: [],
            },
          ],
        },
      ],
      education: [
        {
          candidateId: "education-1",
          institution: fixtureSemanticValueOf(
            institution,
            "Meridian Technical College",
          ),
          degree: fixtureSemanticValueOf(degree, "Diploma in Network Systems"),
          fieldOfStudy: null,
          startDate: fixtureSemanticValueOf(educationDates, "2015"),
          endDate: fixtureSemanticValueOf(educationDates, "2018"),
          location: null,
          details: [],
        },
      ],
      skills: [
        {
          candidateId: "skill-1",
          name: fixtureSemanticValueOf(skillsLine, "Linux"),
          category: null,
        },
        {
          candidateId: "skill-2",
          name: fixtureSemanticValueOf(skillsLine, "Networking"),
          category: null,
        },
        {
          candidateId: "skill-3",
          name: fixtureSemanticValueOf(skillsLine, "SQL"),
          category: null,
        },
      ],
      languages: [
        {
          candidateId: "language-1",
          name: fixtureSemanticValueOf(languagesLine, "English"),
          proficiency: fixtureSemanticValueOf(languagesLine, "native"),
        },
      ],
      projects: [],
      certifications: [],
      professionalLinks: [],
    },
    relationships: [
      {
        candidateId: "relationship-1",
        relationshipType: "role_belongs_to_employer",
        fromCandidateId: "role-1",
        toCandidateId: "work-1",
        evidence: [
          fixtureEvidenceOf(employer, "Cedar Peak Systems"),
          fixtureEvidenceOf(role, "Support Engineer"),
        ],
        confidence: "high",
      },
    ],
    ambiguityDiagnostics: [],
    conflictDiagnostics: [],
    privacyWarnings: [],
  };
}

/**
 * Expected semantic JSON for the canonical real-document structurally
 * ambiguous PDF fixture (`pdf-ambiguous-canonical-anonymous`, T246-C06). The
 * two-column binary interleaves its flattened reading order, so the role
 * title's association with the employer and the "2019 – Present" span's
 * association with the role are genuinely ambiguous. The expected output
 * extracts only explicitly evidenced single-fragment facts, keeps the
 * ambiguous date null, declares no invented relationship, and surfaces both
 * uncertainties as grounded ambiguity diagnostics.
 */
function buildPdfAmbiguousCanonicalResponse(
  fragments: readonly SemanticParserSourceFragment[],
): NuvitaeSemanticExtractionResponse {
  const name = fixtureFragmentAt(fragments, 0);
  const email = fixtureFragmentAt(fragments, 1);
  const location = fixtureFragmentAt(fragments, 2);
  const headline = fixtureFragmentAt(fragments, 3);
  const employer = fixtureFragmentAt(fragments, 5);
  const role = fixtureFragmentAt(fragments, 7);
  const skillsLine = fixtureFragmentAt(fragments, 8);
  const ambiguousDates = fixtureFragmentAt(fragments, 9);
  const responsibility = fixtureFragmentAt(fragments, 11);
  const degree = fixtureFragmentAt(fragments, 12);
  const institution = fixtureFragmentAt(fragments, 13);
  const educationDates = fixtureFragmentAt(fragments, 14);

  return {
    schemaVersion: nuvitaeSemanticExtractionResponseVersion,
    documentLanguage: {
      value: "english",
      confidence: "high",
      evidence: [fixtureEvidenceOf(headline, "Engineer")],
    },
    sections: {
      contact: {
        fullName: fixtureSemanticValueOf(name, "Amir Hussain-Example"),
        email: fixtureSemanticValueOf(email, "amir.hussain@example.invalid"),
        phone: null,
        location: fixtureSemanticValueOf(location, "Berlin, Germany"),
        website: null,
      },
      headline: fixtureSemanticValueOf(headline, "Data Platform Engineer"),
      summary: null,
      workExperience: [
        {
          candidateId: "work-1",
          employerName: fixtureSemanticValueOf(employer, "Northbeam Systems"),
          employerLocation: null,
          roles: [
            {
              candidateId: "role-1",
              title: fixtureSemanticValueOf(
                role,
                "Streaming Infrastructure Engineer",
              ),
              location: null,
              startDate: null,
              endDate: null,
              isOngoing: null,
              responsibilities: [
                fixtureSemanticValueOf(
                  responsibility,
                  "Built and operated the streaming platform for the data team.",
                ),
              ],
              achievements: [],
            },
          ],
        },
      ],
      education: [
        {
          candidateId: "education-1",
          institution: fixtureSemanticValueOf(
            institution,
            "Hochschule Example Berlin",
          ),
          degree: fixtureSemanticValueOf(degree, "MSc Computer Science"),
          fieldOfStudy: null,
          startDate: fixtureSemanticValueOf(educationDates, "2015"),
          endDate: fixtureSemanticValueOf(educationDates, "2019"),
          location: null,
          details: [],
        },
      ],
      skills: [
        {
          candidateId: "skill-1",
          name: fixtureSemanticValueOf(skillsLine, "Kafka"),
          category: null,
        },
        {
          candidateId: "skill-2",
          name: fixtureSemanticValueOf(skillsLine, "Spark"),
          category: null,
        },
        {
          candidateId: "skill-3",
          name: fixtureSemanticValueOf(skillsLine, "Python"),
          category: null,
        },
        {
          candidateId: "skill-4",
          name: fixtureSemanticValueOf(skillsLine, "Kubernetes"),
          category: null,
        },
      ],
      languages: [],
      projects: [],
      certifications: [],
      professionalLinks: [],
    },
    relationships: [],
    ambiguityDiagnostics: [
      {
        code: "ambiguous_role_association",
        message:
          "The role title and employer appear in interleaved columns and their association requires review.",
        severity: "warning",
        evidence: [
          fixtureEvidenceOf(employer, "Northbeam Systems"),
          fixtureEvidenceOf(role, "Streaming Infrastructure Engineer"),
        ],
        safeDetail:
          "The flattened multi-column reading order interleaves the employer and role columns.",
      },
      {
        code: "ambiguous_date",
        message:
          "The date span could belong to the role or to another section and requires review.",
        severity: "warning",
        evidence: [fixtureEvidenceOf(ambiguousDates, "2019 – Present")],
        safeDetail:
          "The date span is interleaved between the skills and education columns.",
      },
    ],
    conflictDiagnostics: [],
    privacyWarnings: [],
  };
}

/**
 * Expected semantic JSON for the canonical real-document
 * prompt-instruction-like DOCX fixture
 * (`docx-prompt-instruction-canonical-anonymous`, T246-C07). The instruction
 * lines under "Additional notes" are ordinary untrusted document content:
 * they produce no facts, do not alter the JSON schema, do not request tools
 * or network operations, do not change authorization state or evidence
 * paths, do not increase retries, do not change provider/model targets, do
 * not expose credentials, and do not disable grounding or no-invention
 * rules. Only the explicitly evidenced résumé facts are expected.
 */
function buildDocxPromptInstructionCanonicalResponse(
  fragments: readonly SemanticParserSourceFragment[],
): NuvitaeSemanticExtractionResponse {
  const name = fixtureFragmentAt(fragments, 0);
  const email = fixtureFragmentAt(fragments, 1);
  const location = fixtureFragmentAt(fragments, 2);
  const headline = fixtureFragmentAt(fragments, 3);
  const summary = fixtureFragmentAt(fragments, 5);
  const employer = fixtureFragmentAt(fragments, 7);
  const role = fixtureFragmentAt(fragments, 8);
  const dates = fixtureFragmentAt(fragments, 9);
  const firstResponsibility = fixtureFragmentAt(fragments, 10);
  const secondResponsibility = fixtureFragmentAt(fragments, 11);
  const degree = fixtureFragmentAt(fragments, 13);
  const institution = fixtureFragmentAt(fragments, 14);
  const educationDates = fixtureFragmentAt(fragments, 15);
  const skillsLine = fixtureFragmentAt(fragments, 17);
  const languagesLine = fixtureFragmentAt(fragments, 19);

  return {
    schemaVersion: nuvitaeSemanticExtractionResponseVersion,
    documentLanguage: {
      value: "english",
      confidence: "high",
      evidence: [fixtureEvidenceOf(languagesLine, "English")],
    },
    sections: {
      contact: {
        fullName: fixtureSemanticValueOf(name, "Priya Raman-Example"),
        email: fixtureSemanticValueOf(email, "priya.raman@example.invalid"),
        phone: null,
        location: fixtureSemanticValueOf(location, "Toronto, Canada"),
        website: null,
      },
      headline: fixtureSemanticValueOf(headline, "Product Analyst"),
      summary: fixtureSemanticValueOf(
        summary,
        "Product analyst who documents careful workflows and measures feature impact.",
      ),
      workExperience: [
        {
          candidateId: "work-1",
          employerName: fixtureSemanticValueOf(employer, "Lumina Analytics"),
          employerLocation: null,
          roles: [
            {
              candidateId: "role-1",
              title: fixtureSemanticValueOf(role, "Product Analyst"),
              location: null,
              startDate: fixtureSemanticValueOf(dates, "2021"),
              endDate: null,
              isOngoing: true,
              responsibilities: [
                fixtureSemanticValueOf(
                  firstResponsibility,
                  "Built review checklists for twelve demonstration cases.",
                ),
                fixtureSemanticValueOf(
                  secondResponsibility,
                  "Maintained data dictionaries for the analytics team.",
                ),
              ],
              achievements: [],
            },
          ],
        },
      ],
      education: [
        {
          candidateId: "education-1",
          institution: fixtureSemanticValueOf(
            institution,
            "Northbridge University",
          ),
          degree: fixtureSemanticValueOf(degree, "BSc Economics"),
          fieldOfStudy: null,
          startDate: fixtureSemanticValueOf(educationDates, "2016"),
          endDate: fixtureSemanticValueOf(educationDates, "2020"),
          location: null,
          details: [],
        },
      ],
      skills: [
        {
          candidateId: "skill-1",
          name: fixtureSemanticValueOf(skillsLine, "SQL"),
          category: null,
        },
        {
          candidateId: "skill-2",
          name: fixtureSemanticValueOf(skillsLine, "Documentation"),
          category: null,
        },
        {
          candidateId: "skill-3",
          name: fixtureSemanticValueOf(skillsLine, "Testing"),
          category: null,
        },
      ],
      languages: [
        {
          candidateId: "language-1",
          name: fixtureSemanticValueOf(languagesLine, "English"),
          proficiency: fixtureSemanticValueOf(languagesLine, "native"),
        },
        {
          candidateId: "language-2",
          name: fixtureSemanticValueOf(languagesLine, "French"),
          proficiency: fixtureSemanticValueOf(languagesLine, "conversational"),
        },
      ],
      projects: [],
      certifications: [],
      professionalLinks: [],
    },
    relationships: [
      {
        candidateId: "relationship-1",
        relationshipType: "role_belongs_to_employer",
        fromCandidateId: "role-1",
        toCandidateId: "work-1",
        evidence: [
          fixtureEvidenceOf(employer, "Lumina Analytics"),
          fixtureEvidenceOf(role, "Product Analyst"),
        ],
        confidence: "high",
      },
    ],
    ambiguityDiagnostics: [],
    conflictDiagnostics: [],
    privacyWarnings: [],
  };
}

export const expectedSemanticJsonById: Readonly<
  Record<SemanticParserFixtureId, NuvitaeSemanticExtractionResponse>
> = {
  "pdf-english-anonymous": t210ProfileResponse("pdf-english-anonymous"),
  "docx-english-anonymous": t210ProfileResponse("docx-english-anonymous"),
  "pdf-french-anonymous": buildPdfFrenchResponse(
    fragmentsOf("pdf-french-anonymous"),
  ),
  "pdf-french-canonical-anonymous": buildPdfFrenchCanonicalResponse(
    fragmentsOf("pdf-french-canonical-anonymous"),
  ),
  "docx-french-anonymous": buildDocxFrenchResponse(
    fragmentsOf("docx-french-anonymous"),
  ),
  "pdf-bilingual-anonymous": buildPdfBilingualResponse(
    fragmentsOf("pdf-bilingual-anonymous"),
  ),
  "docx-bilingual-anonymous": buildDocxBilingualResponse(
    fragmentsOf("docx-bilingual-anonymous"),
  ),
  "pdf-english-multi-column-anonymous": buildPdfEnglishMultiColumnResponse(
    fragmentsOf("pdf-english-multi-column-anonymous"),
  ),
  "docx-french-multi-column-anonymous": buildDocxFrenchMultiColumnResponse(
    fragmentsOf("docx-french-multi-column-anonymous"),
  ),
  "pdf-bilingual-canonical-anonymous": buildPdfBilingualCanonicalResponse(
    fragmentsOf("pdf-bilingual-canonical-anonymous"),
  ),
  "docx-partial-canonical-anonymous": buildDocxPartialCanonicalResponse(
    fragmentsOf("docx-partial-canonical-anonymous"),
  ),
  "pdf-ambiguous-canonical-anonymous": buildPdfAmbiguousCanonicalResponse(
    fragmentsOf("pdf-ambiguous-canonical-anonymous"),
  ),
  "docx-prompt-instruction-canonical-anonymous":
    buildDocxPromptInstructionCanonicalResponse(
      fragmentsOf("docx-prompt-instruction-canonical-anonymous"),
    ),
};

export interface SemanticParserFixture extends SemanticParserFixtureInput {
  readonly expectedResponse: NuvitaeSemanticExtractionResponse;
}

export const semanticParserFixtures: readonly SemanticParserFixture[] =
  semanticParserFixtureIds.map((fixtureId) => {
    const input = semanticParserFixtureInputs[fixtureId];
    if (input === undefined) {
      throw new Error(`Missing semantic parser fixture input "${fixtureId}".`);
    }
    const expectedResponse = expectedSemanticJsonById[fixtureId];
    if (expectedResponse === undefined) {
      throw new Error(`Missing expected semantic JSON for "${fixtureId}".`);
    }
    return { ...input, expectedResponse };
  });
