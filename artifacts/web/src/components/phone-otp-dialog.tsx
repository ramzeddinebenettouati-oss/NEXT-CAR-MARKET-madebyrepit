/**
 * PhoneOtpDialog
 *
 * Three-step dialog for phone number sign-in / sign-up:
 *   Step 1 — Enter phone number + country dial code → request OTP
 *   Step 2 — Enter 6-digit OTP (auto-advance boxes, resend timer)
 *   Step 3 — Complete profile (new users only: role, name, company, email)
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { customFetch } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Loader2, Phone, Building2, CarFront } from "lucide-react";

// Complete ITU country calling-code list. Keeping this in the shared dialog
// means phone sign-in and phone sign-up accept the same international numbers.
const DIAL_CODES = `Afghanistan|+93
Albania|+355
Algeria|+213
American Samoa|+1684
Andorra|+376
Angola|+244
Anguilla|+1264
Antarctica|+672
Antigua and Barbuda|+1268
Argentina|+54
Armenia|+374
Aruba|+297
Ascension Island|+247
Australia|+61
Austria|+43
Azerbaijan|+994
Bahamas|+1242
Bahrain|+973
Bangladesh|+880
Barbados|+1246
Belarus|+375
Belgium|+32
Belize|+501
Benin|+229
Bermuda|+1441
Bhutan|+975
Bolivia|+591
Bosnia and Herzegovina|+387
Botswana|+267
Brazil|+55
British Indian Ocean Territory|+246
British Virgin Islands|+1284
Brunei|+673
Bulgaria|+359
Burkina Faso|+226
Burundi|+257
Cambodia|+855
Cameroon|+237
Canada|+1
Cape Verde|+238
Cayman Islands|+1345
Central African Republic|+236
Chad|+235
Chile|+56
China|+86
Christmas Island|+61
Cocos Islands|+61
Colombia|+57
Comoros|+269
Congo - Brazzaville|+242
Congo - Kinshasa|+243
Cook Islands|+682
Costa Rica|+506
Croatia|+385
Cuba|+53
Cyprus|+357
Czechia|+420
Denmark|+45
Djibouti|+253
Dominica|+1767
Dominican Republic|+1809
Dominican Republic|+1829
Dominican Republic|+1849
Ecuador|+593
Egypt|+20
El Salvador|+503
Equatorial Guinea|+240
Eritrea|+291
Estonia|+372
Eswatini|+268
Ethiopia|+251
Falkland Islands|+500
Faroe Islands|+298
Fiji|+679
Finland|+358
France|+33
French Guiana|+594
French Polynesia|+689
Gabon|+241
Gambia|+220
Georgia|+995
Germany|+49
Ghana|+233
Gibraltar|+350
Greece|+30
Greenland|+299
Grenada|+1473
Guadeloupe|+590
Guam|+1671
Guatemala|+502
Guernsey|+441481
Guinea|+224
Guinea-Bissau|+245
Guyana|+592
Haiti|+509
Honduras|+504
Hong Kong|+852
Hungary|+36
Iceland|+354
India|+91
Indonesia|+62
Iran|+98
Iraq|+964
Ireland|+353
Isle of Man|+441624
Israel|+972
Italy|+39
Jamaica|+1876
Japan|+81
Jersey|+441534
Jordan|+962
Kazakhstan|+7
Kenya|+254
Kiribati|+686
Kosovo|+383
Kuwait|+965
Kyrgyzstan|+996
Laos|+856
Latvia|+371
Lebanon|+961
Lesotho|+266
Liberia|+231
Libya|+218
Liechtenstein|+423
Lithuania|+370
Luxembourg|+352
Macao|+853
Madagascar|+261
Malawi|+265
Malaysia|+60
Maldives|+960
Mali|+223
Malta|+356
Marshall Islands|+692
Martinique|+596
Mauritania|+222
Mauritius|+230
Mayotte|+262
Mexico|+52
Micronesia|+691
Moldova|+373
Monaco|+377
Mongolia|+976
Montenegro|+382
Montserrat|+1664
Morocco|+212
Mozambique|+258
Myanmar|+95
Namibia|+264
Nauru|+674
Nepal|+977
Netherlands|+31
New Caledonia|+687
New Zealand|+64
Nicaragua|+505
Niger|+227
Nigeria|+234
Niue|+683
Norfolk Island|+672
North Korea|+850
North Macedonia|+389
Northern Mariana Islands|+1670
Norway|+47
Oman|+968
Pakistan|+92
Palau|+680
Palestine|+970
Panama|+507
Papua New Guinea|+675
Paraguay|+595
Peru|+51
Philippines|+63
Pitcairn Islands|+64
Poland|+48
Portugal|+351
Puerto Rico|+1787
Puerto Rico|+1939
Qatar|+974
Reunion|+262
Romania|+40
Russia|+7
Rwanda|+250
Saint Barthelemy|+590
Saint Helena|+290
Saint Kitts and Nevis|+1869
Saint Lucia|+1758
Saint Martin|+590
Saint Pierre and Miquelon|+508
Saint Vincent and the Grenadines|+1784
Samoa|+685
San Marino|+378
Sao Tome and Principe|+239
Saudi Arabia|+966
Senegal|+221
Serbia|+381
Seychelles|+248
Sierra Leone|+232
Singapore|+65
Sint Maarten|+1721
Slovakia|+421
Slovenia|+386
Solomon Islands|+677
Somalia|+252
South Africa|+27
South Korea|+82
South Sudan|+211
Spain|+34
Sri Lanka|+94
Sudan|+249
Suriname|+597
Svalbard and Jan Mayen|+47
Sweden|+46
Switzerland|+41
Syria|+963
Taiwan|+886
Tajikistan|+992
Tanzania|+255
Thailand|+66
Timor-Leste|+670
Togo|+228
Tokelau|+690
Tonga|+676
Trinidad and Tobago|+1868
Tunisia|+216
Turkey|+90
Turkmenistan|+993
Turks and Caicos Islands|+1649
Tuvalu|+688
Uganda|+256
Ukraine|+380
United Arab Emirates|+971
United Kingdom|+44
United States|+1
United States Virgin Islands|+1340
Uruguay|+598
Uzbekistan|+998
Vanuatu|+678
Vatican City|+39
Venezuela|+58
Vietnam|+84
Wallis and Futuna|+681
Western Sahara|+212
Yemen|+967
Zambia|+260
Zimbabwe|+263`
  .split("\n")
  .map((entry) => {
    const [country, code] = entry.split("|");
    return { country, code };
  });

// ─── OTP 6-box input ─────────────────────────────────────────────────────────
function OtpInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const refs = Array.from({ length: 6 }, () => useRef<HTMLInputElement>(null));

  function handleChange(idx: number, e: React.ChangeEvent<HTMLInputElement>) {
    const ch = e.target.value.replace(/\D/g, "").slice(-1);
    const next = value.split("").slice(0, 6);
    next[idx] = ch;
    const joined = next.join("").slice(0, 6);
    onChange(joined);
    if (ch && idx < 5) refs[idx + 1].current?.focus();
  }

  function handleKeyDown(idx: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      if (!value[idx] && idx > 0) {
        const next = value.split("").slice(0, 6);
        next[idx - 1] = "";
        onChange(next.join(""));
        refs[idx - 1].current?.focus();
      } else {
        const next = value.split("").slice(0, 6);
        next[idx] = "";
        onChange(next.join(""));
      }
    } else if (e.key === "ArrowLeft" && idx > 0) {
      refs[idx - 1].current?.focus();
    } else if (e.key === "ArrowRight" && idx < 5) {
      refs[idx + 1].current?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const digits = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    onChange(digits.padEnd(6, "").slice(0, 6));
    const lastFilled = Math.min(digits.length, 5);
    refs[lastFilled].current?.focus();
  }

  return (
    <div className="flex gap-2 justify-center" onPaste={handlePaste}>
      {Array.from({ length: 6 }).map((_, i) => (
        <input
          key={i}
          ref={refs[i]}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={value[i] ?? ""}
          onChange={(e) => handleChange(i, e)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          autoFocus={i === 0}
          className="w-11 h-14 text-center text-xl font-bold rounded-md border border-border bg-background
                     focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary
                     transition-colors caret-transparent"
        />
      ))}
    </div>
  );
}

// ─── Resend timer ─────────────────────────────────────────────────────────────
function ResendTimer({ onResend }: { onResend: () => void }) {
  const [seconds, setSeconds] = useState(60);

  useEffect(() => {
    setSeconds(60);
    const id = setInterval(() => setSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [onResend]);

  if (seconds > 0) {
    return (
      <p className="text-sm text-muted-foreground text-center">
        Resend code in <span className="font-semibold tabular-nums">{seconds}s</span>
      </p>
    );
  }
  return (
    <button
      type="button"
      onClick={onResend}
      className="text-sm text-primary font-medium hover:underline block mx-auto"
    >
      Resend code
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
interface PhoneOtpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "login" hides the role/company step for existing users. "register" pre-selects buyer. */
  mode?: "login" | "register";
  initialRole?: "buyer" | "seller";
}

type Step = "phone" | "otp" | "profile";

export function PhoneOtpDialog({ open, onOpenChange, mode = "login", initialRole = "buyer" }: PhoneOtpDialogProps) {
  const { setSession } = useAuth();
  const [, setLocation] = useLocation();

  const [step, setStep] = useState<Step>("phone");
  const [dialSelection, setDialSelection] = useState("China|+86");
  const [localNumber, setLocalNumber] = useState("");
  const [otp, setOtp] = useState("");
  const [phoneToken, setPhoneToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendKey, setResendKey] = useState(0);

  // Profile step
  const [role, setRole] = useState<"buyer" | "seller">("buyer");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");

  // Reset when dialog closes
  useEffect(() => {
    if (open) setRole(initialRole);
    if (!open) {
      setStep("phone");
      setLocalNumber("");
      setOtp("");
      setPhoneToken("");
      setFirstName("");
      setLastName("");
      setCompanyName("");
      setEmail("");
      setLoading(false);
    }
  }, [open, initialRole]);

  const dialCode = dialSelection.split("|")[1] ?? "+86";
  const fullPhone = `${dialCode}${localNumber.replace(/\D/g, "")}`;

  // ── Step 1: Request OTP ────────────────────────────────────────────────────
  const requestOtp = useCallback(async () => {
    const digits = localNumber.replace(/\D/g, "");
    if (!digits || digits.length < 6) {
      toast.error("Enter a valid phone number");
      return;
    }

    setLoading(true);
    try {
      const data = await customFetch<{ message: string; devOtp?: string }>(
        "/api/auth/phone/request-otp",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: fullPhone }),
        }
      );

      if (data.devOtp) {
        toast.info(`Dev mode — OTP: ${data.devOtp}`, { duration: 30000 });
      } else {
        toast.success("Code sent! Check your phone.");
      }
      setOtp("");
      setStep("otp");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to send OTP. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [fullPhone, localNumber]);

  // ── Step 2: Verify OTP ─────────────────────────────────────────────────────
  async function verifyOtp() {
    if (otp.length < 6) {
      toast.error("Enter all 6 digits");
      return;
    }

    setLoading(true);
    try {
      const data = await customFetch<{
        needsProfile: boolean;
        accessToken?: string;
        refreshToken?: string;
        user?: any;
        phoneToken?: string;
      }>("/api/auth/phone/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: fullPhone, otp }),
      });

      if (!data.needsProfile && data.accessToken) {
        // Existing user — sign in directly
        setSession(data.accessToken, data.refreshToken!, data.user);
        toast.success("Signed in successfully!");
        onOpenChange(false);
        setLocation("/dashboard");
      } else if (data.phoneToken) {
        // New user — proceed to profile step
        setPhoneToken(data.phoneToken);
        setStep("profile");
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Invalid code. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // ── Step 3: Complete profile ───────────────────────────────────────────────
  async function completeProfile() {
    if (!firstName.trim() || !lastName.trim() || !companyName.trim()) {
      toast.error("Please fill in all required fields");
      return;
    }

    setLoading(true);
    try {
      const data = await customFetch<{ accessToken: string; refreshToken: string; user: any }>(
        "/api/auth/phone/complete",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phoneToken,
            role,
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            companyName: companyName.trim(),
            email: email.trim() || undefined,
          }),
        }
      );

      setSession(data.accessToken, data.refreshToken, data.user);
      toast.success("Account created! Welcome to AutoCango.");
      onOpenChange(false);
      setLocation("/dashboard");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to create account. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const stepTitle: Record<Step, string> = {
    phone: mode === "register" ? "Sign up with Phone" : "Sign in with Phone",
    otp: "Enter your code",
    profile: "Complete your profile",
  };
  const stepDesc: Record<Step, string> = {
    phone: "Enter your mobile number. We'll send you a 6-digit verification code.",
    otp: `We sent a code to ${dialCode} ${localNumber}`,
    profile: "Just a few more details to set up your account.",
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5 text-green-500" />
            {stepTitle[step]}
          </DialogTitle>
          <DialogDescription>{stepDesc[step]}</DialogDescription>
        </DialogHeader>

        {/* ── Step 1: Phone ─────────────────────────────────────────────────── */}
        {step === "phone" && (
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Country</Label>
              <Select value={dialSelection} onValueChange={setDialSelection}>
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-72 overflow-y-auto">
                  {DIAL_CODES.map((d) => (
                    <SelectItem key={`${d.country}|${d.code}`} value={`${d.country}|${d.code}`}>
                      <span className="font-mono text-xs text-muted-foreground mr-1">{d.code}</span>
                      {d.country}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Phone number</Label>
              <div className="flex gap-2">
                <span className="flex items-center justify-center px-3 rounded-md border border-border bg-muted text-sm font-mono shrink-0">
                  {dialCode}
                </span>
                <Input
                  type="tel"
                  inputMode="numeric"
                  placeholder="13800138000"
                  className="h-11 flex-1"
                  value={localNumber}
                  onChange={(e) => setLocalNumber(e.target.value.replace(/[^\d\s\-()]/g, ""))}
                  onKeyDown={(e) => { if (e.key === "Enter") requestOtp(); }}
                  autoFocus
                />
              </div>
              <p className="text-xs text-muted-foreground">Enter local number without country code</p>
            </div>

            <Button
              className="w-full h-11 gap-2"
              onClick={requestOtp}
              disabled={loading || !localNumber.replace(/\D/g, "")}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              Send verification code
            </Button>
          </div>
        )}

        {/* ── Step 2: OTP ───────────────────────────────────────────────────── */}
        {step === "otp" && (
          <div className="space-y-6 py-2">
            <OtpInput
              value={otp}
              onChange={(v) => {
                setOtp(v);
                if (v.length === 6) {
                  // auto-verify when all digits entered
                  setTimeout(() => {
                    if (v.length === 6) verifyOtp();
                  }, 120);
                }
              }}
            />

            <ResendTimer
              key={resendKey}
              onResend={() => {
                setOtp("");
                setResendKey((k) => k + 1);
                requestOtp();
              }}
            />

            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => { setStep("phone"); setOtp(""); }}
                disabled={loading}
              >
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <Button
                className="flex-1 gap-2"
                onClick={verifyOtp}
                disabled={loading || otp.length < 6}
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Verify
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 3: Profile ────────────────────────────────────────────────── */}
        {step === "profile" && (
          <div className="space-y-4 py-2">
            {/* Role */}
            <div className="space-y-2">
              <Label>I am registering as</Label>
              <RadioGroup
                value={role}
                onValueChange={(v) => setRole(v as "buyer" | "seller")}
                className="grid grid-cols-2 gap-3"
              >
                <label className={`flex flex-col items-center justify-center rounded-md border-2 p-3 cursor-pointer transition-colors ${role === "buyer" ? "border-primary bg-primary/5" : "border-muted hover:bg-accent"}`}>
                  <RadioGroupItem value="buyer" className="sr-only" />
                  <Building2 className="h-5 w-5 mb-1" />
                  <span className="text-sm font-medium">International Buyer</span>
                </label>
                <label className={`flex flex-col items-center justify-center rounded-md border-2 p-3 cursor-pointer transition-colors ${role === "seller" ? "border-primary bg-primary/5" : "border-muted hover:bg-accent"}`}>
                  <RadioGroupItem value="seller" className="sr-only" />
                  <CarFront className="h-5 w-5 mb-1" />
                  <span className="text-sm font-medium">Chinese Seller</span>
                </label>
              </RadioGroup>
            </div>

            {/* Name */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>First name <span className="text-destructive">*</span></Label>
                <Input
                  placeholder="John"
                  className="h-11"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Last name <span className="text-destructive">*</span></Label>
                <Input
                  placeholder="Doe"
                  className="h-11"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </div>
            </div>

            {/* Company */}
            <div className="space-y-1.5">
              <Label>Company name <span className="text-destructive">*</span></Label>
              <Input
                placeholder="Acme Logistics LLC"
                className="h-11"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
              />
            </div>

            {/* Email (optional) */}
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1">
                Work email
                <span className="text-xs text-muted-foreground">(optional)</span>
              </Label>
              <Input
                type="email"
                placeholder="john@company.com"
                className="h-11"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <Button
              className="w-full h-11 gap-2"
              onClick={completeProfile}
              disabled={loading || !firstName.trim() || !lastName.trim() || !companyName.trim()}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              Create account
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
