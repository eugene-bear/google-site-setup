export const ALL_PLATFORMS = [
    "ads",
    "meta",
    "clarity",
    "linkedin",
];
const META_PIXEL_HTML = `<!-- Meta Pixel — paused stub. Replace __PIXEL_ID__ with your real pixel ID. -->
<script>
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '__PIXEL_ID__');
fbq('track', 'PageView');
</script>
<noscript><img height="1" width="1" style="display:none"
src="https://www.facebook.com/tr?id=__PIXEL_ID__&ev=PageView&noscript=1" /></noscript>
<!-- End Meta Pixel -->`;
const CLARITY_HTML = `<!-- Microsoft Clarity — paused stub. Replace __CLARITY_ID__ with your project ID. -->
<script type="text/javascript">
(function(c,l,a,r,i,t,y){
  c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
  t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
  y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
})(window, document, "clarity", "script", "__CLARITY_ID__");
</script>
<!-- End Clarity -->`;
const LINKEDIN_HTML = `<!-- LinkedIn Insight Tag — paused stub. Replace __PARTNER_ID__ with your partner ID. -->
<script type="text/javascript">
_linkedin_partner_id = "__PARTNER_ID__";
window._linkedin_data_partner_ids = window._linkedin_data_partner_ids || [];
window._linkedin_data_partner_ids.push(_linkedin_partner_id);
</script>
<script type="text/javascript">
(function(l) {
if (!l){window.lintrk = function(a,b){window.lintrk.q.push([a,b])};
window.lintrk.q=[]}
var s = document.getElementsByTagName("script")[0];
var b = document.createElement("script");
b.type = "text/javascript";b.async = true;
b.src = "https://snap.licdn.com/li.lms-analytics/insight.min.js";
s.parentNode.insertBefore(b, s);})(window.lintrk);
</script>
<noscript>
<img height="1" width="1" style="display:none;" alt=""
src="https://px.ads.linkedin.com/collect/?pid=__PARTNER_ID__&fmt=gif" />
</noscript>
<!-- End LinkedIn Insight Tag -->`;
export function getConversionTag(platform) {
    switch (platform) {
        case "ads":
            return {
                name: "Google Ads Conversion - PAUSED",
                notes: "Paused stub created by google-site-setup. Replace __CONVERSION_ID__ and __CONVERSION_LABEL__, attach a trigger, and unpause.",
                body: {
                    name: "Google Ads Conversion - PAUSED",
                    type: "awct",
                    paused: true,
                    firingTriggerId: [],
                    notes: "Paused stub. Replace __CONVERSION_ID__ and __CONVERSION_LABEL__ with real values from Google Ads.",
                    parameter: [
                        { type: "template", key: "conversionId", value: "__CONVERSION_ID__" },
                        { type: "template", key: "conversionLabel", value: "__CONVERSION_LABEL__" },
                        { type: "boolean", key: "enableConversionLinker", value: "true" },
                    ],
                },
            };
        case "meta":
            return {
                name: "Meta Pixel - PAUSED",
                notes: "Paused stub. Replace __PIXEL_ID__ with your real Meta pixel ID, attach an All Pages trigger, and unpause.",
                body: {
                    name: "Meta Pixel - PAUSED",
                    type: "html",
                    paused: true,
                    firingTriggerId: [],
                    parameter: [
                        { type: "template", key: "html", value: META_PIXEL_HTML },
                        { type: "boolean", key: "supportDocumentWrite", value: "false" },
                    ],
                },
            };
        case "clarity":
            return {
                name: "Microsoft Clarity - PAUSED",
                notes: "Paused stub. Replace __CLARITY_ID__ with your Clarity project ID, attach an All Pages trigger, and unpause.",
                body: {
                    name: "Microsoft Clarity - PAUSED",
                    type: "html",
                    paused: true,
                    firingTriggerId: [],
                    parameter: [
                        { type: "template", key: "html", value: CLARITY_HTML },
                        { type: "boolean", key: "supportDocumentWrite", value: "false" },
                    ],
                },
            };
        case "linkedin":
            return {
                name: "LinkedIn Insight Tag - PAUSED",
                notes: "Paused stub. Replace __PARTNER_ID__ with your LinkedIn partner ID, attach an All Pages trigger, and unpause.",
                body: {
                    name: "LinkedIn Insight Tag - PAUSED",
                    type: "html",
                    paused: true,
                    firingTriggerId: [],
                    parameter: [
                        { type: "template", key: "html", value: LINKEDIN_HTML },
                        { type: "boolean", key: "supportDocumentWrite", value: "false" },
                    ],
                },
            };
    }
}
