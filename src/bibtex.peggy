{
  function node(type, properties = {}) {
    return { type, raw: text(), location: location(), ...properties };
  }

  function literal(kind, value) {
    return node("literal", { kind, value });
  }
}

Document
  = _ item:(Preamble / StringDefinition / CommentDirective / Entry) _ !. { return item; }

Preamble
  = "@preamble"i _ body:(
      "{" _ expression:Expression _ "}" { return { delimiter: "braces", expression }; }
      / "(" _ expression:Expression _ ")" { return { delimiter: "parentheses", expression }; }
    ) {
      return node("preamble", body);
    }

StringDefinition
  = "@string"i _ body:(
      "{" _ definition:StringBody _ "}" { return { delimiter: "braces", ...definition }; }
      / "(" _ definition:StringBody _ ")" { return { delimiter: "parentheses", ...definition }; }
    ) {
      return node("string", body);
    }

StringBody
  = name:Identifier _ "=" _ expression:Expression _ comma:","? {
      return {
        name,
        normalizedName: name.toLowerCase(),
        expression,
        trailingComma: Boolean(comma),
      };
    }

CommentDirective
  = "@comment"i _ body:(BracedComment / ParenthesizedComment) {
      return node("comment", { value: body });
    }

BracedComment
  = "{" value:BracedContent "}" { return value; }

ParenthesizedComment
  = "(" value:ParenthesizedContent ")" { return value; }

Entry
  = "@" typeName:Identifier _ body:(
      "{" content:EntryBody "}" { return { delimiter: "braces", ...content }; }
      / "(" content:EntryBody ")" { return { delimiter: "parentheses", ...content }; }
    ) {
      return node("entry", {
        entryType: typeName.toLowerCase(),
        delimiter: body.delimiter,
        key: body.key,
        fields: body.fields,
      });
    }

EntryBody
  = _ key:EntryKey? _ fields:FieldList? _ trailingComma:","? _ {
      return {
        key: key ?? null,
        fields: fields ?? [],
        trailingComma: Boolean(trailingComma),
      };
    }

EntryKey
  = value:$([^,={}()\r\n]+) _ "," { return value.trim(); }

FieldList
  = first:Field rest:(_ "," _ field:Field { return field; })* { return [first, ...rest]; }

Field
  = name:FieldName assignment:(_ "=" _ expression:Expression { return expression; })? {
      return node("field", {
        name,
        normalizedName: name.toLowerCase(),
        expression: assignment ?? null,
        raw: assignment?.raw ?? "",
        source: text(),
      });
    }

FieldName
  = value:$([^=,{}()\r\n]+) { return value.trim(); }

Expression
  = first:ValuePart rest:(_ "#" _ part:ValuePart { return part; })* {
      if (rest.length === 0) return first;
      return node("concatenation", { parts: [first, ...rest] });
    }

ValuePart
  = QuotedLiteral
  / BracedLiteral
  / NumberLiteral
  / IdentifierReference

QuotedLiteral
  = "\"" value:QuotedContent "\"" { return literal("quoted", value); }

BracedLiteral
  = "{" value:BracedContent "}" { return literal("braced", value); }

NumberLiteral
  = value:$([0-9]+) { return literal("number", value); }

IdentifierReference
  = name:Identifier { return node("identifier", { name, normalizedName: name.toLowerCase() }); }

Identifier
  = $([^=#,{}()\[\] \t\n\r]+)

QuotedContent
  = parts:(EscapedCharacter / QuotedBracedGroup / !"\"" character:. { return character; })* {
      return parts.join("");
    }

QuotedBracedGroup
  = "{" value:BracedContent "}" { return `{${value}}`; }

BracedContent
  = parts:(EscapedCharacter / NestedBracedGroup / [^{}])* { return parts.join(""); }

NestedBracedGroup
  = "{" value:BracedContent "}" { return `{${value}}`; }

ParenthesizedContent
  = parts:(EscapedCharacter / NestedParenthesizedGroup / [^()])* { return parts.join(""); }

NestedParenthesizedGroup
  = "(" value:ParenthesizedContent ")" { return `(${value})`; }

EscapedCharacter
  = "\\" character:. { return `\\${character}`; }

_ = (Whitespace / PercentComment)*

Whitespace
  = [ \t\n\r]

PercentComment
  = "%" [^\n\r]* ("\r\n" / "\n" / "\r" / !.)
