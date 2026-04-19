// A varied corpus of public-domain / open-access PDFs. Covers papers,
// novels, textbooks, manuals, reports, religious texts, cookbooks, plays,
// poetry, memoirs, and legal/gov documents.
//
// Used by test/pull-corpus.ts to download into test/corpus/ and by
// test/harness.ts when run with `--corpus` to iterate against real PDFs.
//
// Each entry has a stable name (used as filename) and a category. The
// category lets the harness report pass/fail rates by genre.

export interface CorpusEntry {
  name: string;
  url: string;
  category:
    | "paper" | "novel" | "textbook" | "manual" | "report" | "religious"
    | "play" | "poetry" | "memoir" | "cookbook" | "reference" | "law"
    | "medicine" | "military" | "finance" | "philosophy" | "nonenglish"
    | "business" | "history";
}

export const CORPUS: CorpusEntry[] = [
  // ─── Papers (arxiv) ─────────────────────────────────────────────────────
  { name: "paper-attention-is-all-you-need", category: "paper", url: "https://arxiv.org/pdf/1706.03762" },
  { name: "paper-gpt3", category: "paper", url: "https://arxiv.org/pdf/2005.14165" },
  { name: "paper-bert", category: "paper", url: "https://arxiv.org/pdf/1810.04805" },
  { name: "paper-resnet", category: "paper", url: "https://arxiv.org/pdf/1512.03385" },
  { name: "paper-vit", category: "paper", url: "https://arxiv.org/pdf/2010.11929" },
  { name: "paper-alphafold", category: "paper", url: "https://arxiv.org/pdf/2204.11677" },
  { name: "paper-diffusion", category: "paper", url: "https://arxiv.org/pdf/2006.11239" },
  { name: "paper-llama2", category: "paper", url: "https://arxiv.org/pdf/2307.09288" },
  { name: "paper-lora", category: "paper", url: "https://arxiv.org/pdf/2106.09685" },
  { name: "paper-rlhf", category: "paper", url: "https://arxiv.org/pdf/2203.02155" },

  // ─── Novels (planetebook) ───────────────────────────────────────────────
  { name: "novel-treasure-island", category: "novel", url: "https://www.planetebook.com/free-ebooks/treasure-island.pdf" },
  { name: "novel-pride-and-prejudice", category: "novel", url: "https://www.planetebook.com/free-ebooks/pride-and-prejudice.pdf" },
  { name: "novel-alice-in-wonderland", category: "novel", url: "https://www.planetebook.com/free-ebooks/alices-adventures-in-wonderland.pdf" },
  { name: "novel-dracula", category: "novel", url: "https://www.planetebook.com/free-ebooks/dracula.pdf" },
  { name: "novel-sherlock-holmes", category: "novel", url: "https://www.planetebook.com/free-ebooks/the-adventures-of-sherlock-holmes.pdf" },
  { name: "novel-frankenstein", category: "novel", url: "https://www.planetebook.com/free-ebooks/frankenstein.pdf" },
  { name: "novel-jane-eyre", category: "novel", url: "https://www.planetebook.com/free-ebooks/jane-eyre.pdf" },
  { name: "novel-moby-dick", category: "novel", url: "https://www.planetebook.com/free-ebooks/moby-dick.pdf" },
  { name: "novel-war-and-peace", category: "novel", url: "https://www.planetebook.com/free-ebooks/war-and-peace.pdf" },
  { name: "novel-huck-finn", category: "novel", url: "https://www.planetebook.com/free-ebooks/adventures-of-huckleberry-finn.pdf" },
  { name: "novel-tale-of-two-cities", category: "novel", url: "https://www.planetebook.com/free-ebooks/a-tale-of-two-cities.pdf" },
  { name: "novel-little-women", category: "novel", url: "https://www.planetebook.com/free-ebooks/little-women.pdf" },
  { name: "novel-wuthering-heights", category: "novel", url: "https://www.planetebook.com/free-ebooks/wuthering-heights.pdf" },
  { name: "novel-great-expectations", category: "novel", url: "https://www.planetebook.com/free-ebooks/great-expectations.pdf" },
  { name: "novel-picture-dorian-gray", category: "novel", url: "https://www.planetebook.com/free-ebooks/the-picture-of-dorian-gray.pdf" },

  // ─── Textbooks (open-access) ────────────────────────────────────────────
  { name: "textbook-think-python", category: "textbook", url: "https://greenteapress.com/thinkpython2/thinkpython2.pdf" },
  { name: "textbook-think-stats", category: "textbook", url: "https://greenteapress.com/thinkstats2/thinkstats2.pdf" },
  { name: "textbook-think-os", category: "textbook", url: "https://greenteapress.com/thinkos/thinkos.pdf" },
  { name: "textbook-think-bayes", category: "textbook", url: "https://greenteapress.com/thinkbayes/thinkbayes.pdf" },
  { name: "textbook-think-dsp", category: "textbook", url: "https://greenteapress.com/thinkdsp/thinkdsp.pdf" },
  { name: "textbook-openstax-physics", category: "textbook", url: "https://openstax.org/books/college-physics-2e/get_file/pdf" },
  { name: "textbook-openstax-calculus-1", category: "textbook", url: "https://openstax.org/books/calculus-volume-1/get_file/pdf" },
  { name: "textbook-openstax-psych", category: "textbook", url: "https://openstax.org/books/psychology-2e/get_file/pdf" },
  { name: "textbook-ai-modern-approach", category: "textbook", url: "https://people.engr.tamu.edu/guni/csce421/files/AI_Russell_Norvig.pdf" },

  // ─── Manuals / technical references ─────────────────────────────────────
  { name: "manual-bash", category: "manual", url: "https://www.gnu.org/software/bash/manual/bash.pdf" },
  { name: "manual-gawk", category: "manual", url: "https://www.gnu.org/software/gawk/manual/gawk.pdf" },
  { name: "manual-make", category: "manual", url: "https://www.gnu.org/software/make/manual/make.pdf" },
  { name: "manual-gdb", category: "manual", url: "https://sourceware.org/gdb/current/onlinedocs/gdb.pdf" },
  { name: "manual-emacs", category: "manual", url: "https://www.gnu.org/software/emacs/manual/pdf/emacs.pdf" },
  { name: "manual-git", category: "manual", url: "https://git-scm.com/book/en/v2/en/progit.pdf" },
  { name: "manual-rust-book", category: "manual", url: "https://github.com/rust-lang/book/raw/main/packages/trpl/assets/rust-book-online.pdf" },

  // ─── Reports / white papers (government) ────────────────────────────────
  { name: "report-fed-monetary", category: "report", url: "https://www.federalreserve.gov/monetarypolicy/files/20240308_mprfullreport.pdf" },
  { name: "report-911-commission", category: "report", url: "https://govinfo.library.unt.edu/911/report/911Report.pdf" },
  { name: "report-mueller-v1", category: "report", url: "https://www.justice.gov/storage/report.pdf" },

  // ─── Religious / classical ──────────────────────────────────────────────
  { name: "religious-kjv-bible", category: "religious", url: "https://ebible.org/pdf/eng-kjv2006/eng-kjv2006_all.pdf" },

  // ─── Plays / poetry ─────────────────────────────────────────────────────
  { name: "play-hamlet", category: "play", url: "https://www.planetebook.com/free-ebooks/hamlet.pdf" },
  { name: "play-romeo-juliet", category: "play", url: "https://www.planetebook.com/free-ebooks/romeo-and-juliet.pdf" },
  { name: "play-macbeth", category: "play", url: "https://www.planetebook.com/free-ebooks/macbeth.pdf" },
  { name: "poetry-leaves-of-grass", category: "poetry", url: "https://www.planetebook.com/free-ebooks/leaves-of-grass.pdf" },

  // ─── Memoirs ────────────────────────────────────────────────────────────
  { name: "memoir-narrative-frederick-douglass", category: "memoir", url: "https://www.planetebook.com/free-ebooks/narrative-of-the-life-of-frederick-douglass.pdf" },
  { name: "memoir-walden", category: "memoir", url: "https://www.planetebook.com/free-ebooks/walden.pdf" },

  // ─── Cookbooks / instructional ──────────────────────────────────────────
  { name: "cookbook-mrs-beeton", category: "cookbook", url: "https://www.gutenberg.org/cache/epub/10136/pg10136-images-3.pdf" },

  // ─── Reference ──────────────────────────────────────────────────────────
  { name: "reference-art-of-war", category: "reference", url: "https://www.planetebook.com/free-ebooks/the-art-of-war.pdf" },
  { name: "reference-prince", category: "reference", url: "https://www.planetebook.com/free-ebooks/the-prince.pdf" },

  // ─── Law (US case law / statutes / textbooks) ───────────────────────────
  { name: "law-us-constitution", category: "law", url: "https://www.archives.gov/files/founding-docs/constitution-transcript.pdf" },
  { name: "law-us-code-title17", category: "law", url: "https://www.copyright.gov/title17/title17.pdf" },
  { name: "law-ucc", category: "law", url: "https://www.uniformlaws.org/HigherLogic/System/DownloadDocumentFile.ashx?DocumentFileKey=36b4d12a-01d4-78c0-67ca-9df93ef23c54" },
  { name: "law-treatise-open", category: "law", url: "https://openbooks.library.umass.edu/lgbtqpartnerviolence/open/download?type=pdf" },
  { name: "law-scotus-obergefell", category: "law", url: "https://www.supremecourt.gov/opinions/14pdf/14-556_3204.pdf" },

  // ─── Medicine / biology ─────────────────────────────────────────────────
  { name: "med-openstax-anatomy", category: "medicine", url: "https://assets.openstax.org/oscms-prodcms/media/documents/AnatomyandPhysiology2e-WEB.pdf" },
  { name: "med-openstax-microbio", category: "medicine", url: "https://assets.openstax.org/oscms-prodcms/media/documents/Microbiology-WEB.pdf" },
  { name: "med-who-icd11", category: "medicine", url: "https://icd.who.int/browse11/Downloads/Download?fileName=icd11_MMS_en.pdf" },
  { name: "med-cdc-field-epi", category: "medicine", url: "https://www.cdc.gov/eis/field-epi-manual/downloads/Field-Epi-Manual.pdf" },

  // ─── Engineering / military ─────────────────────────────────────────────
  { name: "mil-fm-21-76", category: "military", url: "https://www.marines.mil/Portals/1/Publications/FM%2021-76%20Survival.pdf" },
  { name: "mil-army-land-nav", category: "military", url: "https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN36040-TC_3-25.26-000-WEB-1.pdf" },

  // ─── Finance / economics ────────────────────────────────────────────────
  { name: "fin-fed-handbook", category: "finance", url: "https://www.federalreserve.gov/publications/files/pf_complete.pdf" },
  { name: "fin-shiller-irrational", category: "finance", url: "https://www.econ.yale.edu/~shiller/behfin/2003-02/shiller-1.pdf" },

  // ─── Philosophy / ancient classics ──────────────────────────────────────
  { name: "phil-meditations", category: "philosophy", url: "https://www.standardebooks.org/ebooks/marcus-aurelius/meditations/george-long/downloads/meditations.pdf" },
  { name: "phil-republic", category: "philosophy", url: "https://www.idph.com.br/conteudos/ebooks/republic.pdf" },
  { name: "phil-walden-pond", category: "philosophy", url: "https://www.ibiblio.org/ebooks/Thoreau/Walden.pdf" },

  // ─── Children's / poetry varied ─────────────────────────────────────────
  { name: "poetry-shakespeare-sonnets", category: "poetry", url: "https://ia800209.us.archive.org/15/items/shakespearesson01shakgoog/shakespearesson01shakgoog.pdf" },

  // ─── Non-English (various scripts) ──────────────────────────────────────
  // French classic
  { name: "nonen-fr-monte-cristo", category: "nonenglish", url: "https://www.ebooksgratuits.com/pdf/dumas_monte_cristo_1.pdf" },
  // Spanish classic
  { name: "nonen-es-quijote", category: "nonenglish", url: "https://www.gutenberg.org/cache/epub/2000/pg2000.pdf" },
  // German technical
  { name: "nonen-de-grimm", category: "nonenglish", url: "https://www.grimmstories.com/pdf/grimm_contes.pdf" },
  // Chinese
  { name: "nonen-zh-tao-te-ching", category: "nonenglish", url: "https://terebess.hu/english/tao/taotepdf.pdf" },
  // Japanese
  { name: "nonen-jp-bushido", category: "nonenglish", url: "https://www.holybooks.com/wp-content/uploads/Bushido-The-Soul-of-Japan.pdf" },
  // Russian
  { name: "nonen-ru-classics-open", category: "nonenglish", url: "https://rvb.ru/pss_pushkin/pdf/pushkin_01.pdf" },
  // Arabic
  { name: "nonen-ar-sample", category: "nonenglish", url: "https://www.gilgamish.org/media/arabic_unesco.pdf" },

  // ─── Business / self-help / open ────────────────────────────────────────
  { name: "biz-deming-book", category: "business", url: "https://deming.org/wp-content/uploads/2020/06/OOTC-Excerpt.pdf" },
  { name: "biz-lean-startup-excerpt", category: "business", url: "https://sdk.bitmovin.com/docs/latest/web/quickstart.pdf" },

  // ─── Historical docs ────────────────────────────────────────────────────
  { name: "hist-federalist-papers", category: "history", url: "https://www.congress.gov/resources/display/content/The+Federalist+Papers" },
  { name: "hist-darwin-origin", category: "history", url: "https://www.vliz.be/docs/Zeecijfers/Origin_of_Species.pdf" },
  { name: "hist-gibbon-decline", category: "history", url: "https://ia802604.us.archive.org/18/items/GibbonDeclineAndFall/Gibbon-Decline.pdf" },

  // ─── Scientific papers (non-arxiv) ──────────────────────────────────────
  { name: "sci-plos-one-sample", category: "paper", url: "https://journals.plos.org/plosone/article/file?id=10.1371/journal.pone.0077870&type=printable" },
  { name: "sci-nature-open-sample", category: "paper", url: "https://www.nature.com/articles/s41586-020-2649-2.pdf" },

  // ─── Gov / IRS / tax / regulatory ───────────────────────────────────────
  { name: "gov-irs-1040-instructions", category: "report", url: "https://www.irs.gov/pub/irs-pdf/i1040gi.pdf" },
  { name: "gov-fda-orange-book", category: "report", url: "https://www.accessdata.fda.gov/scripts/cder/ob/docs/tempob.pdf" },
  { name: "gov-epa-ghg-report", category: "report", url: "https://www.epa.gov/system/files/documents/2024-04/us-ghg-inventory-2024-main-text_04-18-2024.pdf" },
];
