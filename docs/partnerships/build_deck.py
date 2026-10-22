# Regenerates the partnership deck. Run: python3 docs/partnerships/build_deck.py docs/partnerships/IntellaBets-Sportsbook-Partnership.pptx
# Needs python-pptx (pip install python-pptx). Keep every claim honest: no user,
# traffic, revenue, win-rate or ROI figures until real ones exist.
"""Build the IntellaBets sportsbook partnership deck with python-pptx.

Run with: /usr/bin/python3 build_deck.py <output.pptx>
"""
import sys

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.dml import MSO_LINE_DASH_STYLE
from pptx.enum.shapes import MSO_CONNECTOR, MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, MSO_AUTO_SIZE, PP_ALIGN
from pptx.oxml.ns import qn
from pptx.util import Inches, Pt

OUT = sys.argv[1]

# Brand palette (web/tailwind.config.ts brand scale + requested background)
BG = RGBColor(0x0F, 0x0A, 0x1E)
CARD = RGBColor(0x1B, 0x14, 0x33)
CARD_ALT = RGBColor(0x15, 0x0F, 0x29)
CARD_HI = RGBColor(0x24, 0x1A, 0x45)
BORDER = RGBColor(0x33, 0x28, 0x5C)
ACCENT = RGBColor(0x7C, 0x3A, 0xED)
ACCENT_LT = RGBColor(0xA7, 0x8B, 0xFA)
ACCENT_PALE = RGBColor(0xC4, 0xB5, 0xFD)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
MUTED = RGBColor(0xC9, 0xC3, 0xDD)
DIM = RGBColor(0x8F, 0x86, 0xAD)

HEAD = "Arial"
BODY = "Calibri"

TOTAL = 11
W, H = 13.333, 7.5
MX = 0.6  # side margin

prs = Presentation()
prs.slide_width = Inches(W)
prs.slide_height = Inches(H)
prs.core_properties.title = "IntellaBets Sportsbook Partnership"
prs.core_properties.author = "IntellaBets"
prs.core_properties.subject = "Partnership overview for sportsbook affiliate and business-development teams"

TITLE_ONLY = prs.slide_layouts[5]


def I(v):
    return Inches(v)


def new_slide():
    s = prs.slides.add_slide(TITLE_ONLY)
    s.background.fill.solid()
    s.background.fill.fore_color.rgb = BG
    return s


def style_runs(para, runs, size, color, bold, italic, font):
    for item in runs:
        if isinstance(item, str):
            text, o = item, {}
        else:
            text, o = item
        r = para.add_run()
        r.text = text
        f = r.font
        f.name = o.get("font", font)
        f.size = Pt(o.get("size", size))
        f.bold = o.get("bold", bold)
        f.italic = o.get("italic", italic)
        f.color.rgb = o.get("color", color)


def tb(slide, x, y, w, h, paras, size=16, color=WHITE, bold=False, italic=False,
       align=PP_ALIGN.LEFT, anchor=MSO_ANCHOR.TOP, font=BODY, space_after=0,
       line_spacing=None, name=None):
    box = slide.shapes.add_textbox(I(x), I(y), I(w), I(h))
    if name:
        box.name = name
    tf = box.text_frame
    tf.word_wrap = True
    tf.auto_size = MSO_AUTO_SIZE.NONE
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    tf.vertical_anchor = anchor
    if isinstance(paras, str):
        paras = [paras]
    for i, p in enumerate(paras):
        para = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        para.alignment = align
        para.space_after = Pt(space_after)
        if line_spacing:
            para.line_spacing = line_spacing
        runs = p if isinstance(p, list) else [p]
        style_runs(para, runs, size, color, bold, italic, font)
    return box


def shape(slide, kind, x, y, w, h, fill=CARD, line=None, line_w=1.0, dash=False, name=None):
    s = slide.shapes.add_shape(kind, I(x), I(y), I(w), I(h))
    if name:
        s.name = name
    s.shadow.inherit = False
    if fill is None:
        s.fill.background()
    else:
        s.fill.solid()
        s.fill.fore_color.rgb = fill
    if line is None:
        s.line.fill.background()
    else:
        s.line.color.rgb = line
        s.line.width = Pt(line_w)
        if dash:
            s.line.dash_style = MSO_LINE_DASH_STYLE.DASH
    return s


def card(slide, x, y, w, h, fill=CARD, line=BORDER, dash=False, radius=0.06, name=None):
    s = shape(slide, MSO_SHAPE.ROUNDED_RECTANGLE, x, y, w, h, fill, line, 1.0, dash, name)
    # keep corner radius visually constant regardless of card size
    s.adjustments[0] = min(0.5, radius / min(w, h) * 2.4)
    return s


def circle(slide, x, y, d, label, fill=ACCENT, color=WHITE, size=16, line=None, name=None):
    c = shape(slide, MSO_SHAPE.OVAL, x, y, d, d, fill, line, 1.25, name=name)
    tf = c.text_frame
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    tf.word_wrap = False
    p = tf.paragraphs[0]
    p.alignment = PP_ALIGN.CENTER
    style_runs(p, [label], size, color, True, False, HEAD)
    return c


def line(slide, x1, y1, x2, y2, color=BORDER, width=1.5):
    ln = slide.shapes.add_connector(MSO_CONNECTOR.STRAIGHT, I(x1), I(y1), I(x2), I(y2))
    ln.line.color.rgb = color
    ln.line.width = Pt(width)
    return ln


def set_title(slide, text, x=MX, y=0.78, w=W - 2 * MX, h=0.75, size=36):
    t = slide.shapes.title
    t.left, t.top, t.width, t.height = I(x), I(y), I(w), I(h)
    tf = t.text_frame
    tf.word_wrap = True
    tf.auto_size = MSO_AUTO_SIZE.NONE
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    tf.vertical_anchor = MSO_ANCHOR.TOP
    tf.text = ""
    p = tf.paragraphs[0]
    p.alignment = PP_ALIGN.LEFT
    lines = text if isinstance(text, list) else [text]
    for i, ln in enumerate(lines):
        if i:
            p.add_line_break()
        style_runs(p, [ln], size, WHITE, True, False, HEAD)
    return t


def kicker(slide, text):
    tb(slide, MX, 0.42, 8, 0.3, text.upper(), size=12, color=ACCENT_LT, bold=True,
       font=HEAD, name="Kicker")


def footer(slide, n):
    tb(slide, MX, 7.0, 8, 0.25, "IntellaBets  ·  Sportsbook partnership overview  ·  Pre-launch",
       size=10, color=DIM, name="Footer")
    tb(slide, W - MX - 1, 7.0, 1, 0.25, f"{n} / {TOTAL}", size=10, color=DIM,
       align=PP_ALIGN.RIGHT, name="Slide number")


def notes(slide, text):
    slide.notes_slide.notes_text_frame.text = text


def content_slide(n, kick, title):
    s = new_slide()
    kicker(s, kick)
    set_title(s, title)
    footer(s, n)
    return s


def rings(slide, cx, cy):
    """Concentric outline rings: the deck's bookend motif (title + contact slides)."""
    for d, col, w in ((6.4, BORDER, 1.0), (4.8, BORDER, 1.25), (3.2, ACCENT, 1.5)):
        shape(slide, MSO_SHAPE.OVAL, cx - d / 2, cy - d / 2, d, d, None, col, w, name="Ring")
    shape(slide, MSO_SHAPE.OVAL, cx - 0.85, cy - 0.85, 1.7, 1.7, ACCENT, None, name="Ring core")


def wordmark(slide, x, y):
    m = shape(slide, MSO_SHAPE.ROUNDED_RECTANGLE, x, y, 0.5, 0.5, ACCENT, None, name="Monogram")
    m.adjustments[0] = 0.25
    tf = m.text_frame
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    p = tf.paragraphs[0]
    p.alignment = PP_ALIGN.CENTER
    style_runs(p, ["IB"], 15, WHITE, True, False, HEAD)
    tb(slide, x + 0.65, y, 3, 0.5, "IntellaBets", size=20, bold=True, font=HEAD,
       anchor=MSO_ANCHOR.MIDDLE, name="Wordmark")


def pill(slide, x, y, w, text, fill=None, line_c=ACCENT_LT, color=ACCENT_PALE, size=12, dash=False):
    p = shape(slide, MSO_SHAPE.ROUNDED_RECTANGLE, x, y, w, 0.38, fill, line_c, 1.0, dash, name="Pill")
    p.adjustments[0] = 0.5
    tf = p.text_frame
    tf.margin_left = tf.margin_right = I(0.12)
    tf.margin_top = tf.margin_bottom = 0
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    tf.word_wrap = False
    para = tf.paragraphs[0]
    para.alignment = PP_ALIGN.CENTER
    style_runs(para, [text], size, color, True, False, BODY)
    return p


# ---------------------------------------------------------------- 1 Title
s = new_slide()
rings(s, 11.5, 3.75)
wordmark(s, MX, 0.6)
set_title(s, ["IntellaBets —", "sharper bettors,", "routed to your book"], y=1.55, w=7.3, h=2.45,
          size=44)
tb(s, MX, 4.2, 7.2, 0.9,
   "A partnership overview for sportsbook affiliate and business-development teams",
   size=20, color=MUTED)
pill(s, MX, 5.3, 2.9, "Pre-launch  ·  October 2026")
tb(s, MX, 6.65, 8, 0.35, [[("hello@intellabets.com", {"color": ACCENT_PALE, "bold": True}),
                            ("   ·   intellabets.com", {"color": MUTED})]], size=14)
notes(s, (
    "Open by being clear about who we are and where we are. IntellaBets is a US sports betting "
    "analytics product. It compares prices across sportsbooks, removes each book's margin, and "
    "shows bettors where the best price is. It does not take wagers, hold funds or place bets.\n\n"
    "We are pre-launch: there are no users and no revenue yet, and this deck makes no traffic, "
    "revenue, win-rate or ROI claims. The purpose of the conversation is to set up the affiliate "
    "relationship, the link integration and the state registrations properly before we go live."
))

# ---------------------------------------------------------------- 2 Problem
s = content_slide(2, "The problem", "Decided in one place, placed in another")
tb(s, MX, 1.95, 5.5, 1.85,
   "Serious bettors compare prices across several books before a bet — by hand.",
   size=28, bold=True, font=HEAD, line_spacing=1.05)
tb(s, MX, 3.85, 5.4, 1.1,
   "Between the decision and the confirmed bet sit app switching, searching for the same market "
   "again, and re-entering the selection and stake.",
   size=16, color=MUTED, line_spacing=1.1)

tb(s, MX, 5.3, 5.4, 0.3, "AFTER THE DECISION, TODAY", size=11, bold=True, color=ACCENT_LT,
   font=HEAD)
chip_labels = ["Decide", "Switch app", "Find market", "Re-enter bet", "Confirm"]
chw, chg = 1.0, 0.1
for i, lab in enumerate(chip_labels):
    edge = i in (0, len(chip_labels) - 1)
    c = shape(s, MSO_SHAPE.ROUNDED_RECTANGLE, MX + i * (chw + chg), 5.65, chw, 0.45,
              ACCENT if edge else CARD, None if edge else BORDER, 1.0, name=f"Step chip {i + 1}")
    c.adjustments[0] = 0.5
    tf = c.text_frame
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    tf.word_wrap = False
    para = tf.paragraphs[0]
    para.alignment = PP_ALIGN.CENTER
    style_runs(para, [lab], 11, WHITE, edge, False, BODY)

cx, cw = 6.75, W - MX - 6.75
for i, (title, body) in enumerate([
    ("Bettors line-shop manually",
     "They open several sportsbook apps, compare odds, find the same market again and re-type the "
     "selection and stake."),
    ("Books lose informed customers to friction",
     "Every extra step between “I’ve decided” and “bet confirmed” is a point where an "
     "already-decided bettor can drop off or go elsewhere."),
]):
    y = 1.95 + i * 2.45
    card(s, cx, y, cw, 2.15, name=f"Problem card {i + 1}")
    circle(s, cx + 0.35, y + 0.35, 0.55, str(i + 1))
    tb(s, cx + 1.15, y + 0.35, cw - 1.5, 0.55, title, size=19, bold=True, font=HEAD,
       anchor=MSO_ANCHOR.MIDDLE)
    tb(s, cx + 1.15, y + 1.0, cw - 1.5, 1.0, body, size=15, color=MUTED, line_spacing=1.08)
notes(s, (
    "The problem is friction, described qualitatively. We have no measured drop-off figures and "
    "should not cite any.\n\n"
    "Bettors who care about price check several books before every bet. Once they have decided, "
    "they still have to switch apps, find the market again and re-enter the bet. For a book, that "
    "gap is where a customer who has already made up their mind can drop off or bet somewhere else."
))

# ---------------------------------------------------------------- 3 What it is
s = content_slide(3, "What IntellaBets is", "Price analysis across books — analysis only")
cols = [
    ("De-vig consensus",
     "We remove each book’s margin from its prices and average the results across many books into "
     "a consensus fair probability."),
    ("+EV price detection",
     "Where the best price beats the consensus, the bet has positive expected value: a pricing "
     "gap between books, not a prediction about the game."),
    ("CLV tracking",
     "We compare the price a user took with the closing price, the honest measure of whether "
     "picks beat the market."),
]
gap = 0.35
colw = (W - 2 * MX - 2 * gap) / 3
for i, (title, body) in enumerate(cols):
    x = MX + i * (colw + gap)
    card(s, x, 1.95, colw, 3.15, name=f"Capability {i + 1}")
    circle(s, x + 0.35, 2.3, 0.55, str(i + 1))
    tb(s, x + 0.35, 3.05, colw - 0.7, 0.45, title, size=19, bold=True, font=HEAD)
    tb(s, x + 0.35, 3.55, colw - 0.7, 1.45, body, size=15, color=MUTED, line_spacing=1.08)

card(s, MX, 5.4, W - 2 * MX, 1.25, fill=CARD_HI, line=ACCENT, name="Analysis-only callout")
tb(s, MX + 0.4, 5.4, W - 2 * MX - 0.8, 1.25, [[
    ("Analysis only.  ", {"bold": True, "color": WHITE, "font": HEAD}),
    ("IntellaBets never takes wagers, holds customer funds or places bets. Every bet is placed and "
     "confirmed by the user in their own sportsbook account.", {"color": MUTED}),
]], size=16, anchor=MSO_ANCHOR.MIDDLE)
notes(s, (
    "Three pieces of analysis. First, de-vig: each book's implied probabilities add up to more "
    "than 100%; we remove that margin proportionally and average across books to get a consensus. "
    "Second, +EV: where the best price beats that consensus, the price is better than the fair "
    "probability. That is a statement about price, not a promise that a bet wins. Third, closing "
    "line value: we compare the price taken with the closing price, which is the honest scoreboard.\n\n"
    "Stress the last line: we are analysis only. No wagers, no funds, no bet placement."
))

# ---------------------------------------------------------------- 4 User journey
s = content_slide(4, "The user journey", "How a user reaches your book")
steps = [
    ("Pick", "A +EV pick shows the selection and the consensus fair price."),
    ("Compare by payout",
     "The “Compare sportsbooks” panel lists each book’s price and payout for the user’s stake, "
     "best first."),
    ("“Open betslip →”",
     "One tap opens your site or app at the selection, prefilled on the betslip where your link "
     "format supports it."),
    ("User confirms",
     "The user reviews and places the bet in their own account with you."),
]
sw = (W - 2 * MX) / 4
cy = 2.35
line(s, MX + sw / 2, cy + 0.35, MX + 3.5 * sw, cy + 0.35, color=ACCENT, width=2)
for i, (title, body) in enumerate(steps):
    x = MX + i * sw
    circle(s, x + sw / 2 - 0.35, cy, 0.7, str(i + 1), size=20, line=BG)
    tb(s, x + 0.15, cy + 0.95, sw - 0.3, 0.5, title, size=18, bold=True, font=HEAD,
       align=PP_ALIGN.CENTER)
    tb(s, x + 0.2, cy + 1.5, sw - 0.4, 1.4, body, size=14, color=MUTED, align=PP_ALIGN.CENTER,
       line_spacing=1.08)

card(s, MX, 5.45, W - 2 * MX, 1.2, fill=CARD_HI, line=ACCENT, name="Book keeps the customer")
tb(s, MX + 0.4, 5.45, W - 2 * MX - 0.8, 1.2, [[
    ("Your book keeps the customer.  ", {"bold": True, "color": WHITE, "font": HEAD}),
    ("Account, funds, identity checks, geolocation, limits, settlement and responsible-gambling "
     "tools all stay with you.", {"color": MUTED}),
]], size=16, anchor=MSO_ANCHOR.MIDDLE)
notes(s, (
    "Walk the flow left to right. A user opens a pick, opens the Compare sportsbooks panel, which "
    "lists every book's price and payout for their stake with the best payout first, and taps "
    "Open betslip next to the book they choose.\n\n"
    "Today these links come from our odds data provider and are included where the provider "
    "supplies one. Some land on a prefilled betslip, others on the event page; that is one reason "
    "we are asking for your official link spec.\n\n"
    "The bet is always placed by the user, in their own account, under your controls."
))

# ---------------------------------------------------------------- 5 Why good for a book
s = content_slide(5, "Why it works for a book", "High-intent bettors, fewer steps to a bet")
benefits = [
    ("Already-decided bettors",
     "Users arrive with a specific selection and price in mind. The analysis is done before they "
     "tap through."),
    ("Prefilled betslips",
     "Landing on the betslip instead of a home page removes the search and re-entry steps where "
     "bettors drop off."),
    ("Fair, payout-only ranking",
     "At launch we show only books licensed in the user’s state, ranked by payout. Partnerships "
     "never change the order."),
]
for i, (title, body) in enumerate(benefits):
    x = MX + i * (colw + gap)
    card(s, x, 1.95, colw, 2.55, name=f"Benefit {i + 1}")
    circle(s, x + 0.35, 2.3, 0.55, str(i + 1))
    tb(s, x + 1.1, 2.3, colw - 1.4, 0.55, title, size=18, bold=True, font=HEAD,
       anchor=MSO_ANCHOR.MIDDLE)
    tb(s, x + 0.35, 3.05, colw - 0.7, 1.35, body, size=15, color=MUTED, line_spacing=1.08)

card(s, MX, 4.8, W - 2 * MX, 1.85, fill=None, line=ACCENT_LT, dash=True, name="Metrics placeholder")
tb(s, MX + 0.4, 4.95, 6, 0.35, "[Launch metrics — to be added]", size=14, bold=True,
   italic=True, color=ACCENT_PALE)
tb(s, W - MX - 6.4, 4.95, 6.0, 0.35, "IntellaBets is pre-launch. No figures yet.",
   size=12, italic=True, color=DIM, align=PP_ALIGN.RIGHT)
mw = (W - 2 * MX - 0.8) / 3
for i, label in enumerate(["Monthly active users", "Click-throughs to partner books",
                           "Betslip-to-bet conversion"]):
    x = MX + 0.4 + i * mw
    tb(s, x, 5.35, mw, 0.6, "—", size=32, bold=True, font=HEAD, color=ACCENT_LT)
    tb(s, x, 5.95, mw, 0.4, label, size=13, color=MUTED)
notes(s, (
    "The value to a book is the quality of the visit, not volume claims. A user who taps Open "
    "betslip has already chosen the selection and the book.\n\n"
    "Ranking: we rank by payout for the user's stake. A commercial relationship never changes the "
    "order. At launch, betslip links appear only for books licensed in the user's state.\n\n"
    "The dashed box is deliberately empty. We have no users yet, so there are no metrics to "
    "share. We will fill it with measured figures after launch and nothing before."
))

# ---------------------------------------------------------------- 6 Responsible gambling
s = content_slide(6, "Responsible gambling & compliance", "Responsible gambling, built in before launch")
pill(s, W - MX - 4.6, 0.38, 4.6, "Status: being implemented — required before go-live",
     size=11)
rg = [
    ("21+ everywhere", "Age gate and every age reference on the site set to 21+."),
    ("Helpline beside every link",
     "A responsible-gaming message and helpline on every page, pick and ad that shows a betslip "
     "link. 1-800-GAMBLER for NJ users."),
    ("No inducement language",
     "Never “risk-free”, “free bet”, “guaranteed win” or “lock”, in pick write-ups or generated "
     "content."),
    ("Clear affiliate disclosure",
     "A prominent disclosure of our commercial relationships with sportsbooks."),
    ("Licensed books only",
     "Betslip links only for books licensed in the user’s state, and none where online sports "
     "betting is not legal. No offshore books."),
    ("Self-exclusion & records",
     "We honour self-exclusion and opt-outs and keep an archive of every ad and promotion."),
]
gw = (W - 2 * MX - 2 * 0.3) / 3
gh = 2.2
for i, (title, body) in enumerate(rg):
    r, c = divmod(i, 3)
    x = MX + c * (gw + 0.3)
    y = 1.9 + r * (gh + 0.3)
    card(s, x, y, gw, gh, name=f"RG {i + 1}")
    circle(s, x + 0.3, y + 0.3, 0.5, str(i + 1), size=14)
    tb(s, x + 0.95, y + 0.3, gw - 1.2, 0.5, title, size=17, bold=True, font=HEAD,
       anchor=MSO_ANCHOR.MIDDLE)
    tb(s, x + 0.3, y + 0.95, gw - 0.6, gh - 1.1, body, size=14, color=MUTED, line_spacing=1.05)
notes(s, (
    "Be precise about status: these are commitments that are being implemented now and are "
    "required before we go live in any state. They are not all live on the site today; for "
    "example, some pages still carry 18+ wording that is being changed to 21+. We will share "
    "screenshots for your compliance team's review before launch.\n\n"
    "Sources behind each commitment: helpline on ads (VA 11VAC5-70-240(D), OH 3775-16-08(A)(3), "
    "IL 1900.340(e)(2)); 1-800-GAMBLER for NJ users (NJ DGE best practices); banned inducement "
    "language (AGA code; MA 205 CMR 256.04(6); NY 5329.37; OH 3775-16-09(C)); affiliate "
    "disclosure (NY 5329.37(b)(4)); licensed books only (MI R 432.729 vendor certification, "
    "OH 3775-16-08(I), MA 205 CMR 256.02(2), NY non-licensee disclaimer rule); self-exclusion "
    "(VA 11VAC5-70-240(N), NJ best practices).\n\n"
    "Offshore books that appear in our current odds feed (BetOnline.ag, BetUS, Bovada, LowVig.ag, "
    "MyBookie.ag) will not be linked unless confirmed licensed in the user's state."
))

# ---------------------------------------------------------------- 7 Licensing plan
s = content_slide(7, "Licensing & registration", "State-by-state registration plan")
lw = 3.75
principles = [
    ("CPA or flat fee at launch",
     "Keeps us at the lowest registration tier in each state. The only model compatible with NY "
     "and MA."),
    ("Your sponsorship",
     "In NJ, PA and MA the operator files or confirms the relationship."),
    ("Both in place, then live",
     "Our state registration and your approval. We go live one state at a time."),
]
for i, (title, body) in enumerate(principles):
    y = 1.9 + i * 1.65
    card(s, MX, y, lw, 1.45, name=f"Principle {i + 1}")
    tb(s, MX + 0.3, y + 0.2, lw - 0.6, 0.4, title, size=16, bold=True, font=HEAD,
       color=ACCENT_PALE)
    tb(s, MX + 0.3, y + 0.62, lw - 0.6, 0.8, body, size=13, color=MUTED, line_spacing=1.02)

rows = [
    ("State", "What IntellaBets files", "Notes"),
    ("NJ", "Vendor registration; Supplemental Disclosure Form to DGE within 30 days",
     "Operator files the Vendor Registration Form"),
    ("PA", "Gaming service provider registration (interactive / sports wagering)",
     "Submitted by the licensee"),
    ("MA", "Sports Wagering Registrant", "Needs the operator’s Confirmation of Business Relationship"),
    ("MI", "Vendor registration via the MGCB portal",
     "Includes our certification that we promote no illegal sites"),
    ("VA · CO · AZ", "Vendor registration (VA), Vendor Minor (CO), marketing affiliate licence (AZ)",
     "AZ fee not yet confirmed"),
    ("IL · OH", "No affiliate licence, per the regulators",
     "We follow 11 Ill. Adm. Code 1900.340 and OAC 3775-16-08/09"),
    ("NY · NC", "Confirming registration requirements with the regulators",
     "Not live in either state until confirmed"),
]
tx = MX + lw + 0.35
tw = W - MX - tx
gf = s.shapes.add_table(len(rows), 3, I(tx), I(1.9), I(tw), I(4.75))
gf.name = "State registration table"
tbl = gf.table
# "No Style, No Grid" so our own fills drive the look
gf._element.graphic.graphicData.tbl.tblPr.find(qn("a:tableStyleId")).text = (
    "{2D5ABB26-0587-4C30-8999-92F81FD0307C}")
for c, wv in enumerate([1.3, 3.55, tw - 4.85]):
    tbl.columns[c].width = I(wv)
for r, row in enumerate(rows):
    tbl.rows[r].height = I(0.52 if r == 0 else 0.6)
    for c, val in enumerate(row):
        cell = tbl.cell(r, c)
        cell.fill.solid()
        cell.fill.fore_color.rgb = ACCENT if r == 0 else (CARD if r % 2 else CARD_ALT)
        cell.margin_left = cell.margin_right = I(0.12)
        cell.margin_top = cell.margin_bottom = I(0.05)
        cell.vertical_anchor = MSO_ANCHOR.MIDDLE
        tf = cell.text_frame
        tf.word_wrap = True
        tf.text = ""
        p = tf.paragraphs[0]
        bold = r == 0 or c == 0
        color = WHITE if (r == 0 or c == 0) else (MUTED if c == 2 else WHITE)
        style_runs(p, [val], 12, color, bold, False, HEAD if bold else BODY)
notes(s, (
    "This is our plan, not completed registrations. IntellaBets holds no state registrations "
    "today. All of this comes from our own regulatory review; we will confirm the details with "
    "your compliance team.\n\n"
    "Why CPA or flat fee at launch: it keeps us at the lowest tier everywhere (NJ vendor "
    "registration, PA registration, MI vendor, CO Vendor Minor, MA registrant), and it is the only "
    "model compatible with NY (PML 1341(1) allows only fixed sums) and MA (205 CMR 256.01(3) bans "
    "percentage-of-revenue deals). For IL, the CPA trigger must not be 'dependent on, or related "
    "to, the volume or outcome of wagers' (11 Ill. Adm. Code 1900.340(f)); a CPA that requires a "
    "minimum wager may fail that test, so we will have counsel confirm the definition.\n\n"
    "Operator role: NJ's Vendor Registration Form is filed by the licensee; MA requires a "
    "Confirmation of Business Relationship from the operator; PA gaming service provider "
    "applications are submitted by the licensee. MI also requires our certification that we "
    "promote no illegal sites.\n\n"
    "We have a standard licensing pack ready to reuse: formation documents, good standing, "
    "ownership chart with every 10%+ owner, officer and director, qualifier personal-history "
    "information, recent tax returns, a product description, and an honest pre-launch statement."
))

# ---------------------------------------------------------------- 8 The ask
s = content_slide(8, "The ask", "What we are asking for")
asks = [
    ("Affiliate partnership",
     "CPA or flat fee at launch. Revenue share only later, once there is real traffic, and only "
     "where the state permits it (never IL, MA or NY)."),
    ("Official deep-link or betslip spec",
     "Your documented link format or betslip API, so a tap lands on the exact selection, "
     "prefilled."),
    ("Odds & market ID mapping",
     "Event, market and selection identifiers, or a feed, that we can map to the prices we "
     "display."),
    ("Tracking parameters",
     "Your affiliate and click-ID parameters, and how attribution is reported back to us."),
    ("State onboarding checklist",
     "Your requirements for each state, and your filing where the operator must file or confirm "
     "(NJ, PA, MA)."),
]
rh = 0.9
for i, (title, body) in enumerate(asks):
    y = 1.9 + i * (rh + 0.08)
    card(s, MX, y, W - 2 * MX, rh, fill=CARD if i % 2 == 0 else CARD_ALT, line=None,
         name=f"Ask {i + 1}")
    circle(s, MX + 0.3, y + (rh - 0.5) / 2, 0.5, str(i + 1), size=14)
    tb(s, MX + 1.05, y, 3.6, rh, title, size=17, bold=True, font=HEAD, anchor=MSO_ANCHOR.MIDDLE)
    tb(s, MX + 4.8, y, W - 2 * MX - 5.1, rh, body, size=14, color=MUTED, anchor=MSO_ANCHOR.MIDDLE,
       line_spacing=1.05)
notes(s, (
    "Five concrete asks. Commercials first: CPA or a flat fee at launch, because that keeps us at "
    "the lowest registration tier and is the only model allowed in NY and MA. Revenue share is "
    "something to discuss only after there is real traffic, and only where permitted.\n\n"
    "Technical: your official link or betslip spec, the identifiers we need to map our prices to "
    "your markets, and your tracking parameters.\n\n"
    "Compliance: your state onboarding checklist. In NJ, PA and MA the operator files or confirms "
    "our registration, so we need your affiliate team's help to get started."
))

# ---------------------------------------------------------------- 9 Integration options
s = content_slide(9, "Integration options", "Three ways to integrate")
opts = [
    ("A", "Affiliate tracking on our deep links",
     "We already show an “Open betslip” link per book where our odds feed provides one. We add "
     "your tracking parameters.",
     "An affiliate account and your link-parameter format.", "Fastest to start"),
    ("B", "Your betslip API",
     "We build prefilled betslip links from your official spec, using your event, market and "
     "selection IDs.",
     "Your API or link spec, ID mapping and a test environment.", "Most reliable prefill"),
    ("C", "Co-marketing",
     "Jointly approved, compliant content, such as state launch announcements where we are both "
     "approved.",
     "Brand and RG guidelines and an approval workflow. All materials archived and filed where "
     "required.", "Never changes payout ranking"),
]
for i, (letter, title, what, need, tag) in enumerate(opts):
    x = MX + i * (colw + gap)
    card(s, x, 1.9, colw, 4.8, name=f"Option {letter}")
    circle(s, x + 0.35, 2.2, 0.65, letter, size=20)
    tb(s, x + 1.2, 2.2, colw - 1.5, 0.65, title, size=17, bold=True, font=HEAD,
       anchor=MSO_ANCHOR.MIDDLE, line_spacing=0.95)
    tb(s, x + 0.35, 3.1, colw - 0.7, 0.3, "WHAT IT IS", size=11, bold=True, color=ACCENT_LT,
       font=HEAD)
    tb(s, x + 0.35, 3.4, colw - 0.7, 1.15, what, size=14, color=MUTED, line_spacing=1.05)
    tb(s, x + 0.35, 4.6, colw - 0.7, 0.3, "WHAT WE NEED FROM YOU", size=11, bold=True,
       color=ACCENT_LT, font=HEAD)
    tb(s, x + 0.35, 4.9, colw - 0.7, 0.95, need, size=14, color=MUTED, line_spacing=1.05)
    pill(s, x + 0.35, 6.05, colw - 0.7, tag, fill=CARD_HI, line_c=ACCENT, color=WHITE, size=12)
notes(s, (
    "Option A is the quickest. We already render an Open betslip link per book when our odds "
    "data provider supplies one; we append your affiliate tracking. Option B gives the most "
    "reliable prefill, built from your official spec and IDs. Option C is co-marketing: any "
    "content is jointly approved, archived, and filed with regulators where required (for "
    "example, NJ expects ads and promotions, including affiliates', filed with DGE under "
    "N.J.A.C. 13:69O-1.8(g)).\n\n"
    "Whatever option is chosen, ranking stays payout-only. A partnership never moves a book up "
    "the list."
))

# ---------------------------------------------------------------- 10 Roadmap
s = content_slide(10, "Roadmap", "Roadmap and ask timeline")
pill(s, W - MX - 4.3, 0.38, 4.3, "[Target dates — to be confirmed with each partner]",
     line_c=ACCENT_LT, color=ACCENT_PALE, size=11, dash=True)
phases = [
    ("Intro & application", "Intro call; we apply to your affiliate program."),
    ("Onboarding pack", "We send our licensing pack; you share your state onboarding checklist."),
    ("State registrations", "Lowest-tier filings first, with your filing or confirmation where "
                            "required."),
    ("Integrate & test", "Option A first; Option B once your spec is shared."),
    ("Go-live by state", "Only where our registration and your approval are both in place."),
]
pw = (W - 2 * MX) / 5
ty = 2.25
line(s, MX + pw / 2, ty + 0.35, MX + 4.5 * pw, ty + 0.35, color=ACCENT, width=2)
for i, (title, body) in enumerate(phases):
    x = MX + i * pw
    circle(s, x + pw / 2 - 0.35, ty, 0.7, str(i + 1), size=20, line=BG)
    tb(s, x + 0.1, ty + 0.95, pw - 0.2, 0.5, title, size=16, bold=True, font=HEAD,
       align=PP_ALIGN.CENTER)
    tb(s, x + 0.15, ty + 1.45, pw - 0.3, 1.3, body, size=14, color=MUTED, align=PP_ALIGN.CENTER,
       line_spacing=1.05)

card(s, MX, 5.35, W - 2 * MX, 1.3, fill=CARD_HI, line=ACCENT, name="After launch")
tb(s, MX + 0.4, 5.35, 2.4, 1.3, "After launch", size=17, bold=True, font=HEAD,
   anchor=MSO_ANCHOR.MIDDLE)
tb(s, MX + 2.8, 5.35, W - 2 * MX - 3.2, 1.3,
   "Share measured launch metrics  ·  Re-check state rules every quarter and track renewals  ·  "
   "Discuss revenue share only once there is real traffic, and only where permitted",
   size=15, color=MUTED, anchor=MSO_ANCHOR.MIDDLE, line_spacing=1.05)
notes(s, (
    "No dates are promised here; target dates will be agreed with each partner. The order is "
    "what matters: intro and affiliate application, then the onboarding pack and your state "
    "checklist, then registrations, starting with the lowest-cost and fastest (for example NJ "
    "vendor registration, MI vendor registration, PA registration, VA vendor registration, CO "
    "Vendor Minor), then integration and testing, then go-live one state at a time.\n\n"
    "After launch we track renewals (MI vendor every 5 years, VA every 3, PA every 5; an NJ vendor "
    "registration lapses after 3 years without casino business), expect operators to certify "
    "affiliates to NJ DGE each year by Dec 31, and re-check rules each quarter."
))

# ---------------------------------------------------------------- 11 Contact
s = new_slide()
rings(s, 11.5, 3.75)
wordmark(s, MX, 0.6)
set_title(s, "Let’s set this up properly", y=2.0, w=7.5, h=0.9, size=44)
tb(s, MX, 3.1, 7.8, 0.6, "hello@intellabets.com", size=28, bold=True, color=ACCENT_PALE,
   font=HEAD)
tb(s, MX, 3.75, 7.8, 0.45, "intellabets.com", size=20, color=WHITE)
tb(s, MX, 4.6, 7.4, 1.3,
   "IntellaBets is pre-launch, with no users or revenue yet. We want the affiliate terms, link "
   "integration and state registrations in place before we go live.",
   size=16, color=MUTED, line_spacing=1.1)
tb(s, MX, 6.65, 8, 0.35, "21+ only. Please gamble responsibly.", size=12, color=DIM)
notes(s, (
    "Close with the contact details and the honest status. Suggested next step: a short call "
    "with your affiliate or partnerships team to cover the affiliate application, your link or "
    "betslip spec, and your state onboarding checklist.\n\n"
    "Contact: hello@intellabets.com, intellabets.com."
))

assert len(prs.slides) == TOTAL, len(prs.slides)
prs.save(OUT)
print("saved", OUT)
