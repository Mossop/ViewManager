<xsl:stylesheet version="1.0"
		xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
		xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
		xmlns:em="http://www.mozilla.org/2004/em-rdf#">

<xsl:output method="xml" indent="yes"/>

<xsl:variable name="firefox-uid">{ec8030f7-c20a-464f-9b0e-13a3a9e97384}</xsl:variable>
<xsl:variable name="thunderbird-uid">{3550f703-e582-4d05-9a08-453d09bdfdc6}</xsl:variable>
<xsl:variable name="mozilla-uid">{86c18b42-e466-45a9-ae7a-9b95ba6f5640}</xsl:variable>

<xsl:template match="/rdf:RDF/rdf:Description[@about=&quot;urn:mozilla:install-manifest&quot;]">
	<root>
		<extension>
			<id><xsl:value-of select="em:id"/></id>
			<version><xsl:value-of select="em:version"/></version>
			<targets>
				<xsl:apply-templates select="em:targetApplication/rdf:Description"/>
			</targets>
			<xsl:apply-templates select="em:file/rdf:Description"/>
		</extension>
	</root>
</xsl:template>

<xsl:template match="em:targetApplication/rdf:Description">
	<xsl:choose>
		<xsl:when test="em:id=$firefox-uid">
			<firefox>true</firefox>
		</xsl:when>
		<xsl:when test="em:id=$thunderbird-uid">
			<thunderbird>true</thunderbird>
		</xsl:when>
		<xsl:when test="em:id=$mozilla-uid">
			<mozilla>true</mozilla>
		</xsl:when>
	</xsl:choose>
</xsl:template>

<xsl:template match="em:file/rdf:Description">
	<chrome>
		<jarname><xsl:value-of select="substring-after(@about,'urn:mozilla:extension:file:')"/></jarname>
		<files><xsl:apply-templates select="em:package|em:locale|em:skin"/></files>
	</chrome>
</xsl:template>

<xsl:template match="em:package|em:locale|em:skin">
	<xsl:value-of select="."/><xsl:text>*,</xsl:text>
</xsl:template>

</xsl:stylesheet>
