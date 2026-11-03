// Data-side v1 contract; contains no learner data.
export const exchangeSchema = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "study-review-plan.v1 data-side interchange schema",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "schemaVersion",
    "planId",
    "revision",
    "generatedAt",
    "targetExam",
    "topics",
    "evidenceRefs",
    "reviewPolicy",
    "compatibility",
    "coverageStatus"
  ],
  "properties": {
    "schemaVersion": {
      "const": "1.0.0"
    },
    "planId": {
      "type": "string",
      "minLength": 1
    },
    "revision": {
      "type": "integer",
      "minimum": 1
    },
    "generatedAt": {
      "type": "string",
      "format": "date-time"
    },
    "targetExam": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "examKey",
        "displayName",
        "officialName",
        "date",
        "confirmationStatus",
        "nameStatus",
        "dateStatus",
        "scopeStatus",
        "mainCurriculumRounds",
        "reviewCurriculumRounds",
        "aliases",
        "unresolvedItems",
        "evidenceRefs"
      ],
      "properties": {
        "examKey": {
          "type": "string",
          "minLength": 1
        },
        "displayName": {
          "type": "string",
          "minLength": 1
        },
        "officialName": {
          "type": [
            "string",
            "null"
          ]
        },
        "date": {
          "type": "string",
          "format": "date"
        },
        "confirmationStatus": {
          "enum": [
            "confirmed",
            "partially_confirmed",
            "unconfirmed"
          ]
        },
        "nameStatus": {
          "enum": [
            "confirmed",
            "unresolved"
          ]
        },
        "dateStatus": {
          "enum": [
            "confirmed",
            "unconfirmed"
          ]
        },
        "scopeStatus": {
          "type": "string",
          "minLength": 1
        },
        "mainCurriculumRounds": {
          "type": "array",
          "uniqueItems": true,
          "items": {
            "type": "integer",
            "minimum": 1
          }
        },
        "reviewCurriculumRounds": {
          "type": "array",
          "uniqueItems": true,
          "items": {
            "type": "integer",
            "minimum": 1
          }
        },
        "aliases": {
          "type": "array",
          "items": {
            "type": "string",
            "minLength": 1
          }
        },
        "unresolvedItems": {
          "type": "array",
          "items": {
            "type": "string",
            "minLength": 1
          }
        },
        "evidenceRefs": {
          "type": "array",
          "minItems": 1,
          "uniqueItems": true,
          "items": {
            "type": "string",
            "pattern": "^ev-[0-9a-f]{24}$"
          }
        }
      }
    },
    "topics": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "topicId",
          "subject",
          "title",
          "priority",
          "priorityReason",
          "weaknessClassification",
          "causeStatus",
          "scopeRole",
          "scopeStatus",
          "difficultyFocus",
          "recommendedAction",
          "evidenceRefs",
          "questionIds",
          "coverageStatus",
          "coverageReason"
        ],
        "properties": {
          "topicId": {
            "type": "string",
            "pattern": "^[a-z][a-z0-9-]+$"
          },
          "subject": {
            "enum": [
              "math",
              "japanese",
              "science",
              "social"
            ]
          },
          "title": {
            "type": "string",
            "minLength": 1
          },
          "priority": {
            "type": "integer",
            "minimum": 1,
            "maximum": 4
          },
          "priorityReason": {
            "type": "string",
            "minLength": 1
          },
          "weaknessClassification": {
            "enum": [
              "observed_error",
              "recurring_error_pattern",
              "needs_retention_check",
              "improved_in_new_test",
              "demonstrated_strength",
              "not_assessed_for_target_scope"
            ]
          },
          "causeStatus": {
            "enum": [
              "unverified",
              "not_applicable"
            ]
          },
          "scopeRole": {
            "enum": [
              "main",
              "review"
            ]
          },
          "scopeStatus": {
            "type": "string",
            "minLength": 1
          },
          "difficultyFocus": {
            "type": "string",
            "minLength": 1
          },
          "recommendedAction": {
            "type": "string",
            "minLength": 1
          },
          "evidenceRefs": {
            "type": "array",
            "minItems": 1,
            "uniqueItems": true,
            "items": {
              "type": "string",
              "pattern": "^ev-[0-9a-f]{24}$"
            }
          },
          "questionIds": {
            "type": "array",
            "uniqueItems": true,
            "items": {
              "type": "string",
              "minLength": 1
            }
          },
          "coverageStatus": {
            "enum": [
              "verified",
              "partial",
              "missing",
              "unverified"
            ]
          },
          "coverageReason": {
            "type": "string",
            "minLength": 1
          }
        }
      }
    },
    "evidenceRefs": {
      "type": "array",
      "minItems": 1,
      "uniqueItems": true,
      "items": {
        "type": "string",
        "pattern": "^ev-[0-9a-f]{24}$"
      }
    },
    "reviewPolicy": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "timeZone",
        "intervalDays",
        "dailyQuestionTarget",
        "historyOwner",
        "selectionOrder",
        "maxQuestionsPerTopicPerDay",
        "minimumSubjectsWhenEnoughEligibleQuestions",
        "candidateShortfallPolicy",
        "examDateUse",
        "difficultyPolicy",
        "priorityDefinition"
      ],
      "properties": {
        "timeZone": {
          "const": "Asia/Tokyo"
        },
        "intervalDays": {
          "const": [
            1,
            3,
            7,
            14
          ]
        },
        "dailyQuestionTarget": {
          "const": 5
        },
        "historyOwner": {
          "const": "app"
        },
        "selectionOrder": {
          "type": "array",
          "items": {
            "type": "string",
            "minLength": 1
          },
          "minItems": 1,
          "uniqueItems": true
        },
        "maxQuestionsPerTopicPerDay": {
          "type": "integer",
          "minimum": 1
        },
        "minimumSubjectsWhenEnoughEligibleQuestions": {
          "type": "integer",
          "minimum": 1,
          "maximum": 4
        },
        "candidateShortfallPolicy": {
          "type": "string",
          "minLength": 1
        },
        "examDateUse": {
          "type": "string",
          "minLength": 1
        },
        "difficultyPolicy": {
          "type": "string",
          "minLength": 1
        },
        "priorityDefinition": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "1",
            "2",
            "3",
            "4"
          ],
          "properties": {
            "1": {
              "type": "string",
              "minLength": 1
            },
            "2": {
              "type": "string",
              "minLength": 1
            },
            "3": {
              "type": "string",
              "minLength": 1
            },
            "4": {
              "type": "string",
              "minLength": 1
            }
          }
        }
      }
    },
    "compatibility": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "requestedAppVersion",
        "observedSourceVersion",
        "nativeSchemaStatus",
        "questionCatalogStatus",
        "subjectCodesStatus",
        "importReadiness",
        "evidenceRefs"
      ],
      "properties": {
        "requestedAppVersion": {
          "type": "string",
          "minLength": 1
        },
        "observedSourceVersion": {
          "type": "string",
          "minLength": 1
        },
        "nativeSchemaStatus": {
          "type": "string",
          "minLength": 1
        },
        "questionCatalogStatus": {
          "type": "string",
          "minLength": 1
        },
        "subjectCodesStatus": {
          "type": "string",
          "minLength": 1
        },
        "importReadiness": {
          "type": "string",
          "minLength": 1
        },
        "evidenceRefs": {
          "type": "array",
          "minItems": 1,
          "uniqueItems": true,
          "items": {
            "type": "string",
            "pattern": "^ev-[0-9a-f]{24}$"
          }
        }
      }
    },
    "coverageStatus": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "status",
        "verifiedQuestionIdCount",
        "topicsWithVerifiedQuestions",
        "totalTopics",
        "reason"
      ],
      "properties": {
        "status": {
          "enum": [
            "verified",
            "partial",
            "missing",
            "unverified"
          ]
        },
        "verifiedQuestionIdCount": {
          "type": "integer",
          "minimum": 0
        },
        "topicsWithVerifiedQuestions": {
          "type": "integer",
          "minimum": 0
        },
        "totalTopics": {
          "type": "integer",
          "minimum": 1
        },
        "reason": {
          "type": "string",
          "minLength": 1
        }
      }
    }
  }
};
