import getAccessToken from "../utils/getAccessToken";
import apiGet from "roamjs-components/util/apiGet";

type GoogleContactRaw = {
  resourceName: string;
  names?: Array<{
    displayName: string;
    givenName?: string;
    familyName?: string;
  }>;
  phoneNumbers?: Array<{
    value: string;
    type?: string;
  }>;
  emailAddresses?: Array<{
    value: string;
    type?: string;
  }>;
  addresses?: Array<{
    formattedValue: string;
    type?: string;
  }>;
  organizations?: Array<{
    name?: string;
    title?: string;
  }>;
  urls?: Array<{
    value: string;
    type?: string;
  }>;
  birthdays?: Array<{
    date?: {
      year?: number;
      month?: number;
      day?: number;
    };
    text?: string;
  }>;
  relations?: Array<{
    person: string;
    type?: string;
  }>;
};

export type FormattedContact = {
  name: string;
  metadata: {
    "Phone Number": string;
    "Email": string;
    "Location": string;
    "Company": string;
    "Role": string;
    "Social Media": string;
    "Tags": string;
  };
  "Relationship Metadata": {
    "Friends & Family": {
      "Partner": string;
      "Kid": string;
      "Pets": string;
    };
    "Birthday": string;
  };
};

const isSocialMedia = (url: string): boolean => {
  const socialMediaDomains = ["facebook.com", "twitter.com", "linkedin.com", "instagram.com"];
  return socialMediaDomains.some(domain => url.toLowerCase().includes(domain));
};

const formatBirthday = (birthday?: { date?: { year?: number; month?: number; day?: number }; text?: string }): string => {
  if (birthday?.text) return birthday.text;
  if (birthday?.date) {
    const { year, month, day } = birthday.date;
    if (year && month && day) {
      return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    }
  }
  return "";
};

const transformGoogleContact = (contact: GoogleContactRaw): FormattedContact => {
  return {
    name: contact.names?.[0]?.displayName || "Unknown",
    metadata: {
      "Phone Number": contact.phoneNumbers?.[0]?.value || "",
      "Email": contact.emailAddresses?.[0]?.value || "",
      "Location": contact.addresses?.[0]?.formattedValue || "",
      "Company": contact.organizations?.[0]?.name || "",
      "Role": contact.organizations?.[0]?.title || "",
      "Social Media": contact.urls?.filter(url => isSocialMedia(url.value)).map(url => url.value).join(", ") || "",
      "Tags": "#people"
    },
    "Relationship Metadata": {
      "Friends & Family": {
        "Partner": contact.relations?.find(r => r.type === "spouse")?.person || "",
        "Kid": contact.relations?.filter(r => r.type === "child").map(r => r.person).join(", ") || "",
        "Pets": "" // Google People API doesn't typically store pet information
      },
      "Birthday": formatBirthday(contact.birthdays?.[0])
    }
  };
};

export const fetchGoogleContacts = async (): Promise<FormattedContact[]> => {
    const token = await getAccessToken();
    if (!token) {
      throw new Error("Not authenticated with Google");
    }
  
    const personFields = [
      "names",
      "phoneNumbers",
      "emailAddresses",
      "addresses",
      "organizations",
      "urls",
      "birthdays",
      "relations"
    ].join(",");
  
    let allContacts: GoogleContactRaw[] = [];
    let nextPageToken: string | undefined;
  
    do {
      const response = await apiGet<{ connections: GoogleContactRaw[], nextPageToken?: string }>({
        domain: "https://people.googleapis.com",
        path: `v1/people/me/connections?personFields=${personFields}&pageSize=1000&sortOrder=LAST_MODIFIED_ASCENDING${nextPageToken ? `&pageToken=${nextPageToken}` : ''}`,
        authorization: `Bearer ${token}`,
      });
  
      allContacts = allContacts.concat(response.connections);
      nextPageToken = response.nextPageToken;
  
    } while (nextPageToken);
  
    return allContacts.map(transformGoogleContact);
  };