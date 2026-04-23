"""
Spam protection utilities for registration.
Includes disposable email blocking, honeypot validation, and reCAPTCHA verification.
"""
import os
import httpx
import logging
from typing import Optional

logger = logging.getLogger(__name__)

# reCAPTCHA configuration
RECAPTCHA_SECRET_KEY = os.environ.get("RECAPTCHA_SECRET_KEY", "")
RECAPTCHA_VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify"
RECAPTCHA_MIN_SCORE = float(os.environ.get("RECAPTCHA_MIN_SCORE", "0.5"))

# Common disposable email domains (partial list - expand as needed)
DISPOSABLE_EMAIL_DOMAINS = {
    # Popular temporary email services
    "10minutemail.com", "10minutemail.net", "10minutemail.org",
    "tempmail.com", "tempmail.net", "temp-mail.org", "temp-mail.io",
    "guerrillamail.com", "guerrillamail.org", "guerrillamail.net", "guerrillamail.biz",
    "mailinator.com", "mailinator.net", "mailinator.org", "mailinator2.com",
    "throwaway.email", "throwawaymail.com",
    "fakeinbox.com", "fakemailgenerator.com",
    "getnada.com", "nada.email",
    "mohmal.com", "mohmal.im",
    "tempinbox.com", "tempinbox.xyz",
    "trashmail.com", "trashmail.net", "trashmail.org", "trashmail.me",
    "sharklasers.com", "spam4.me", "spamgourmet.com",
    "yopmail.com", "yopmail.fr", "yopmail.net",
    "dispostable.com", "mailnesia.com",
    "maildrop.cc", "mailsac.com",
    "getairmail.com", "discard.email",
    "mailcatch.com", "mintemail.com",
    "mytemp.email", "tempr.email",
    "tempsky.com", "emailondeck.com",
    "crazymailing.com", "tempmailo.com",
    "burnermail.io", "spamfree24.org",
    "emailfake.com", "fakemailgenerator.net",
    "einrot.com", "0815.ru", "0clickemail.com",
    "binkmail.com", "bobmail.info", "bofthew.com",
    "bsnow.net", "bugmenot.com", "bumpymail.com",
    "casualdx.com", "centermail.com", "cheatmail.de",
    "comsafe-mail.net", "coolimpool.org",
    "deadaddress.com", "despam.it", "devnullmail.com",
    "dfgh.net", "digitalsanctuary.com", "discardmail.com",
    "discardmail.de", "disposableaddress.com", "disposableemailaddresses.com",
    "disposableinbox.com", "dispose.it", "disposeamail.com",
    "dispostable.com", "dm.w3internet.co.uk", "dodgeit.com",
    "dodgit.com", "dodgit.org", "dontreg.com",
    "dontsendmespam.de", "drdrb.com", "dump-email.info",
    "dumpandjunk.com", "dumpmail.de", "dumpyemail.com",
    "e4ward.com", "email60.com", "emaildrop.io",
    "emailgo.de", "emailias.com", "emailigo.de",
    "emailinfive.com", "emaillime.com", "emailmiser.com",
    "emailsensei.com", "emailtemporanea.com", "emailtemporanea.net",
    "emailtemporar.ro", "emailtemporario.com.br", "emailthe.net",
    "emailtmp.com", "emailto.de", "emailwarden.com",
    "emailx.at.hm", "emailxfer.com", "emz.net",
    "enterto.com", "ephemail.net", "etranquil.com",
    "etranquil.net", "etranquil.org", "evopo.com",
    "explodemail.com", "express.net.ua", "eyepaste.com",
    "fastacura.com", "fastchevy.com", "fastchrysler.com",
    "fastkawasaki.com", "fastmazda.com", "fastmitsubishi.com",
    "fastnissan.com", "fastsubaru.com", "fastsuzuki.com",
    "fasttoyota.com", "fastyamaha.com", "fightallspam.com",
    "filzmail.com", "fivemail.de", "fixmail.tk",
    "fizmail.com", "flyspam.com", "fr33mail.info",
    "frapmail.com", "friendlymail.co.uk", "front14.org",
    "fuckingduh.com", "fudgerub.com", "garliclife.com",
    "gehensiull.com", "get1mail.com", "get2mail.fr",
    "getonemail.com", "getonemail.net", "ghosttexter.de",
    "girlsundertheinfluence.com", "gishpuppy.com", "goemailgo.com",
    "gorillaswithdirtyarmpits.com", "gotmail.com", "gotmail.net",
    "gotmail.org", "gotti.otherinbox.com", "gowikibooks.com",
    "gowikicampus.com", "gowikicars.com", "gowikifilms.com",
    "gowikigames.com", "gowikimusic.com", "gowikinetwork.com",
    "gowikitravel.com", "gowikitv.com", "great-host.in",
    "greensloth.com", "grr.la", "gsrv.co.uk",
    "guerillamail.biz", "guerillamail.com", "guerillamail.de",
    "guerillamail.info", "guerillamail.net", "guerillamail.org",
    "guerrillamail.info", "h.mintemail.com", "h8s.org",
    "haltospam.com", "harakirimail.com", "hartbot.de",
    "hatespam.org", "hellodream.mobi", "herp.in",
    "hidemail.de", "hidzz.com", "hmamail.com",
    "hochsitze.com", "hopemail.biz", "hotpop.com",
    "hulapla.de", "ieatspam.eu", "ieatspam.info",
    "ieh-mail.de", "ihateyoualot.info", "iheartspam.org",
    "imails.info", "imgof.com", "imgv.de",
    "imstations.com", "inbax.tk", "inbox.si",
    "inboxalias.com", "inboxclean.com", "inboxclean.org",
    "inboxproxy.com", "incognitomail.com", "incognitomail.net",
    "incognitomail.org", "insorg-mail.info", "instant-mail.de",
    "instantemailaddress.com", "iozak.com", "ip6.li",
    "ipoo.org", "irish2me.com", "iwi.net",
    "jetable.com", "jetable.fr.nf", "jetable.net",
    "jetable.org", "jnxjn.com", "jourrapide.com",
    "jsrsolutions.com", "kasmail.com", "kaspop.com",
    "keepmymail.com", "killmail.com", "killmail.net",
    "kimsdisk.com", "kingsq.ga", "kiois.com",
    "kir.ch.tc", "klassmaster.com", "klassmaster.net",
    "klzlv.com", "kook.ml", "kulturbetrieb.info",
    "kurzepost.de", "lawlita.com", "lazyinbox.com",
    "letthemeatspam.com", "lhsdv.com", "lifebyfood.com",
    "link2mail.net", "litedrop.com", "loadby.us",
    "login-email.ml", "lol.ovpn.to", "lookugly.com",
    "lopl.co.cc", "lortemail.dk", "lovemeleaveme.com",
    "lr78.com", "lroid.com", "lukop.dk",
    "m4ilweb.info", "maboard.com", "mail-hierarchie.net",
    "mail-temporaire.fr", "mail.by", "mail.mezimages.net",
    "mail.zp.ua", "mail114.net", "mail2rss.org",
    "mail333.com", "mail4trash.com", "mailbidon.com",
    "mailblocks.com", "mailbucket.org", "mailcat.biz",
    "mailcatch.com", "mailde.de", "mailde.info",
    "maildrop.cc", "maildrop.cf", "maildrop.ga",
    "maildrop.gq", "maildrop.ml", "mailexpire.com",
    "mailfa.tk", "mailforspam.com", "mailfree.ga",
    "mailfreeonline.com", "mailguard.me", "mailin8r.com",
    "mailinater.com", "mailinator.co.uk", "mailinator.info",
    "mailinator.us", "mailinator0.com", "mailinator1.com",
    "mailinblack.com", "mailincubator.com", "mailismagic.com",
    "mailjunk.cf", "mailjunk.ga", "mailjunk.gq",
    "mailjunk.ml", "mailjunk.tk", "mailmate.com",
    "mailme.gq", "mailme.ir", "mailme.lv",
    "mailme24.com", "mailmetrash.com", "mailmoat.com",
    "mailnator.com", "mailnesia.com", "mailnull.com",
    "mailorg.org", "mailpick.biz", "mailproxsy.com",
    "mailquack.com", "mailrock.biz", "mailsac.com",
    "mailscrap.com", "mailseal.de", "mailshell.com",
    "mailsiphon.com", "mailslapping.com", "mailslite.com",
    "mailspam.xyz", "mailtemp.info", "mailtothis.com",
    "mailzilla.com", "mailzilla.org", "makemetheking.com",
    "manifestgenerator.com", "manybrain.com", "mbx.cc",
    "mega.zik.dj", "meinspamschutz.de", "meltmail.com",
    "messagebeamer.de", "mezimages.net", "mierdamail.com",
    "migmail.pl", "migumail.com", "mintemail.com",
    "misterpinball.de", "mmmmail.com", "moakt.com",
    "mobi.web.id", "mobileninja.co.uk", "moburl.com",
    "moncourrier.fr.nf", "monemail.fr.nf", "monmail.fr.nf",
    "monumentmail.com", "ms9.mailslite.com", "msb.minsmail.com",
    "msg.mailslite.com", "mspeciosa.com", "mswork.ru",
    "mt2009.com", "mt2014.com", "myalias.pw",
    "mycleaninbox.net", "myemailboxy.com", "mymail-in.net",
    "mymailoasis.com", "mynetstore.de", "mypacks.net",
    "mypartyclip.de", "myphantomemail.com", "mysamp.de",
    "myspaceinc.com", "myspaceinc.net", "myspacepimpedup.com",
    "myspamless.com", "mytempemail.com", "mytempmail.com",
    "mytrashmail.com", "nabuma.com", "neomailbox.com",
    "nepwk.com", "nervmich.net", "nervtmansen.de",
    "netmails.com", "netmails.net", "netzidiot.de",
    "neverbox.com", "nice-4u.com", "nincsmail.com",
    "nincsmail.hu", "nmail.cf", "no-spam.ws",
    "nobulk.com", "noclickemail.com", "nogmailspam.info",
    "nomail.pw", "nomail.xl.cx", "nomail2me.com",
    "nomorespamemails.com", "noprofiletoday.com", "nospam.ze.tc",
    "nospam4.us", "nospamfor.us", "nospammail.net",
    "nospamthanks.info", "notmailinator.com", "notsharingmy.info",
    "nowhere.org", "nowmymail.com", "nurfuerspam.de",
    "nus.edu.sg", "nwldx.com", "objectmail.com",
    "obobbo.com", "odaymail.com", "odnorazovoe.ru",
    "one-time.email", "oneoffemail.com", "onewaymail.com",
    "onlatedotcom.info", "online.ms", "oopi.org",
    "opayq.com", "ordinaryamerican.net", "otherinbox.com",
    "ourklips.com", "outlawspam.com", "ovpn.to",
    "owlpic.com", "pancakemail.com", "paplease.com",
    "pcusers.otherinbox.com", "pepbot.com", "pfui.ru",
    "pimpedupmyspace.com", "pjjkp.com", "plexolan.de",
    "poczta.onet.pl", "politikerclub.de", "poofy.org",
    "pookmail.com", "postalmail.biz", "privacy.net",
    "privy-mail.com", "privymail.de", "proxymail.eu",
    "prtnx.com", "punkass.com", "putthisinyourspamdatabase.com",
    "pwrby.com", "qisdo.com", "qisoa.com",
    "quickinbox.com", "quickmail.nl", "rcpt.at",
    "reallymymail.com", "realtyalerts.ca", "recode.me",
    "recursor.net", "recyclemail.dk", "regbypass.com",
    "regbypass.comsafe-mail.net", "rejectmail.com", "reliable-mail.com",
    "remail.cf", "remail.ga", "rhyta.com",
    "rklips.com", "rmqkr.net", "royal.net",
    "rppkn.com", "rtrtr.com", "s0ny.net",
    "safe-mail.net", "safersignup.de", "safetymail.info",
    "safetypost.de", "sandelf.de", "saynotospams.com",
    "schafmail.de", "schrott-email.de", "secretemail.de",
    "secure-mail.biz", "secure-mail.cc", "selfdestructingmail.com",
    "sendspamhere.com", "senseless-entertainment.com", "server.ms.selfip.net",
    "services391.com", "sharedmailbox.org", "sharklasers.com",
    "shieldemail.com", "shiftmail.com", "shitmail.me",
    "shitmail.org", "shortmail.net", "showslow.de",
    "shut.name", "shut.ws", "sibmail.com",
    "sinnlos-mail.de", "siteposter.net", "skeefmail.com",
    "slaskpost.se", "slave-auctions.net", "slopsbox.com",
    "slushmail.com", "smaakt.naar.smansen", "smap.4nmv.ru",
    "smashmail.de", "smellfear.com", "smellrear.com",
    "snakemail.com", "sneakemail.com", "sneakmail.de",
    "snkmail.com", "sofimail.com", "sofort-mail.de",
    "softpls.asia", "sogetthis.com", "sohu.com",
    "soisz.com", "solvemail.info", "soodonims.com",
    "spam.la", "spam.su", "spam4.me",
    "spamail.de", "spamarrest.com", "spamavert.com",
    "spambob.com", "spambob.net", "spambob.org",
    "spambog.com", "spambog.de", "spambog.net",
    "spambog.ru", "spambox.info", "spambox.irishspringrealty.com",
    "spambox.us", "spamcannon.com", "spamcannon.net",
    "spamcero.com", "spamcon.org", "spamcorptastic.com",
    "spamcowboy.com", "spamcowboy.net", "spamcowboy.org",
    "spamday.com", "spameater.com", "spameater.org",
    "spamex.com", "spamfree.eu", "spamfree24.com",
    "spamfree24.de", "spamfree24.eu", "spamfree24.info",
    "spamfree24.net", "spamgoes.in", "spamherelots.com",
    "spamhereplease.com", "spamhole.com", "spamify.com",
    "spaminator.de", "spamkill.info", "spaml.com",
    "spaml.de", "spammotel.com", "spamobox.com",
    "spamoff.de", "spamsalad.in", "spamslicer.com",
    "spamspot.com", "spamstack.net", "spamthis.co.uk",
    "spamthisplease.com", "spamtrail.com", "spamtroll.net",
    "speed.1s.fr", "spikio.com", "spoofmail.de",
    "squizzy.de", "ssoia.com", "startkeys.com",
    "stinkefinger.net", "stop-my-spam.cf", "stop-my-spam.ga",
    "stop-my-spam.ml", "stop-my-spam.pp.ua", "stop-my-spam.tk",
    "streetwisemail.com", "stuffmail.de", "super-auctions.com",
    "supergreatmail.com", "supermailer.jp", "superrito.com",
    "superstachel.de", "suremail.info", "svk.jp",
    "sweetxxx.de", "tafmail.com", "tagyourself.com",
    "talkinator.com", "tapchicuoihoi.com", "techemail.com",
    "techgroup.me", "teewars.org", "teleosaurs.xyz",
    "teleworm.com", "teleworm.us", "temp-mail.de",
    "temp-mail.pp.ua", "temp-mail.ru", "temp.emeraldwebmail.com",
    "temp.headstrong.de", "tempail.com", "tempalias.com",
    "tempe-mail.com", "tempemail.biz", "tempemail.co.za",
    "tempemail.com", "tempemail.net", "tempinbox.co.uk",
    "tempmail.co", "tempmail.de", "tempmail.eu",
    "tempmail.it", "tempmail.us", "tempmail2.com",
    "tempmaildemo.com", "tempmailer.com", "tempmailer.de",
    "tempomail.fr", "temporarily.de", "temporarioemail.com.br",
    "temporaryemail.net", "temporaryemail.us", "temporaryforwarding.com",
    "temporaryinbox.com", "temporarymailaddress.com", "tempthe.net",
    "tempymail.com", "tfwno.gf", "thanksnospam.info",
    "thankyou2010.com", "thecloudindex.com", "thelimestones.com",
    "thisisnotmyrealemail.com", "thismail.net", "thismail.ru",
    "throam.com", "throwam.com", "throwawayemailaddress.com",
    "throwawaymail.com", "tilien.com", "tittbit.in",
    "tmail.ws", "tmailinator.com", "tmails.net",
    "tmpmail.net", "tmpmail.org", "toiea.com",
    "toomail.biz", "topranklist.de", "tradermail.info",
    "trash-amil.com", "trash-mail.at", "trash-mail.com",
    "trash-mail.de", "trash-mail.ga", "trash-mail.gq",
    "trash-mail.ml", "trash-mail.tk", "trash2009.com",
    "trash2010.com", "trash2011.com", "trashbox.eu",
    "trashdevil.com", "trashdevil.de", "trashemail.de",
    "trashmail.at", "trashmail.de", "trashmail.ws",
    "trashmailer.com", "trashymail.com", "trashymail.net",
    "trbvm.com", "trickmail.net", "trillianpro.com",
    "tryalert.com", "turual.com", "twinmail.de",
    "twoweirdtricks.com", "tyldd.com", "ubismail.net",
    "uggsrock.com", "umail.net", "unlimit.com",
    "unmail.ru", "upliftnow.com", "uplipht.com",
    "uroid.com", "us.af", "valemail.net",
    "venompen.com", "veryrealemail.com", "viditag.com",
    "viewcastmedia.com", "viewcastmedia.net", "viewcastmedia.org",
    "viralplays.com", "vkcode.ru", "vomoto.com",
    "vpn.st", "vsimcard.com", "vubby.com",
    "walala.org", "walkmail.net", "webemail.me",
    "webm4il.info", "webtrip.ch", "wee.my",
    "weg-werf-email.de", "wegwerf-email-addressen.de", "wegwerf-email.at",
    "wegwerf-email.de", "wegwerf-email.net", "wegwerf-emails.de",
    "wegwerfadresse.de", "wegwerfemail.com", "wegwerfemail.de",
    "wegwerfmail.de", "wegwerfmail.info", "wegwerfmail.net",
    "wegwerfmail.org", "wetrainbayarea.com", "wetrainbayarea.org",
    "wh4f.org", "whatiaas.com", "whatpaas.com",
    "whopy.com", "whtjddn.33mail.com", "whyspam.me",
    "wilemail.com", "willhackforfood.biz", "willselfdestruct.com",
    "winemaven.info", "wolfsmail.tk", "wollan.info",
    "worldspace.link", "wronghead.com", "wuzup.net",
    "wuzupmail.net", "wwwnew.eu", "x.ip6.li",
    "xagloo.co", "xagloo.com", "xemaps.com",
    "xents.com", "xmaily.com", "xoxy.net",
    "yapped.net", "yep.it", "yogamaven.com",
    "yopmail.com", "yopmail.fr", "yopmail.net",
    "yourdomain.com", "ypmail.webarnak.fr.eu.org", "yuurok.com",
    "z1p.biz", "za.com", "zehnminuten.de",
    "zehnminutenmail.de", "zetmail.com", "zippymail.info",
    "zoaxe.com", "zoemail.com", "zoemail.net",
    "zoemail.org", "zomg.info", "zxcv.com",
    "zxcvbnm.com", "zzz.com",
}


def is_disposable_email(email: str) -> bool:
    """
    Check if email domain is a known disposable email service.
    Returns True if disposable, False otherwise.
    """
    if not email or "@" not in email:
        return False
    
    domain = email.lower().split("@")[-1].strip()
    return domain in DISPOSABLE_EMAIL_DOMAINS


def validate_honeypot(honeypot_value: Optional[str]) -> bool:
    """
    Validate honeypot field - should be empty for real users.
    Returns True if valid (empty), False if bot detected (filled).
    """
    if honeypot_value is None:
        return True
    return honeypot_value.strip() == ""


async def verify_recaptcha(token: str, action: str = "register") -> tuple[bool, float, str]:
    """
    Verify reCAPTCHA v3 token with Google.
    Returns (is_valid, score, error_message)
    """
    if not RECAPTCHA_SECRET_KEY:
        # If no secret key configured, skip verification (development mode)
        logger.warning("reCAPTCHA secret key not configured - skipping verification")
        return True, 1.0, ""
    
    if not token:
        return False, 0.0, "reCAPTCHA token is required"
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                RECAPTCHA_VERIFY_URL,
                data={
                    "secret": RECAPTCHA_SECRET_KEY,
                    "response": token,
                },
                timeout=10.0
            )
            
            if response.status_code != 200:
                logger.error(f"reCAPTCHA API error: {response.status_code}")
                return False, 0.0, "reCAPTCHA verification failed"
            
            result = response.json()
            
            if not result.get("success"):
                error_codes = result.get("error-codes", [])
                logger.warning(f"reCAPTCHA verification failed: {error_codes}")
                return False, 0.0, f"reCAPTCHA verification failed: {', '.join(error_codes)}"
            
            score = result.get("score", 0.0)
            expected_action = result.get("action", "")
            
            # Verify action matches
            if expected_action != action:
                logger.warning(f"reCAPTCHA action mismatch: expected {action}, got {expected_action}")
                return False, score, "reCAPTCHA action mismatch"
            
            # Check score threshold
            if score < RECAPTCHA_MIN_SCORE:
                logger.warning(f"reCAPTCHA score too low: {score} < {RECAPTCHA_MIN_SCORE}")
                return False, score, "Verification failed - please try again"
            
            logger.info(f"reCAPTCHA verified successfully: score={score}")
            return True, score, ""
            
    except httpx.TimeoutException:
        logger.error("reCAPTCHA verification timed out")
        return False, 0.0, "reCAPTCHA verification timed out"
    except Exception as e:
        logger.error(f"reCAPTCHA verification error: {e}")
        return False, 0.0, "reCAPTCHA verification error"
