SELECT PROT.biosequence_name,
PROT.biosequence_accession,
PROT.biosequence_gene_name,
PROT.is_covering,
PROT.pct_coverage,
PROT.presence_level,
PROT.probability,
PROT.confidence,
PROT.n_observations,
PROT.norm_PSMs_per_100K,
PROT.n_distinct_peptides,
PROT.chromosome,
PROT.genetic_locus,
PROT.start_in_chromosome,
PROT.end_in_chromosome,
PROT.strand,
PROT.relationship_phrase,
PROT.reference_biosequence,
PROT.represented_by_biosequence_id,
PROT.group_number,
PROT.seq_unique_prots_in_group,
PROT.protein_group_seq_align_link,
IS_KER_IG.is_keratin,
IS_KER_IG.is_immunoglobulin,
PROT.biosequence_description,
PROT.biosequence_accessor,
PROT.biosequence_accessor_suffix,
PROT.organism_full_name,
PROT.ppl_sort_order,
PROT.brt_sort_order

      FROM (
			
     ( SELECT  
           biosequence.biosequence_id AS "biosequence_id",
           biosequence.biosequence_name AS "biosequence_name",
           biosequence.biosequence_accession AS "biosequence_accession",
           biosequence.biosequence_gene_name AS "biosequence_gene_name",
           (CASE WHEN protein_identification.is_covering=1 THEN 'C' ELSE '' END) AS "is_covering",
           protein_identification.percentage_coverage AS "pct_coverage",
           PPL.level_phrase AS "presence_level",
           STR(protein_identification.probability,7,3) AS "probability",
           STR(protein_identification.confidence,7,3) AS "confidence",
           protein_identification.n_observations AS "n_observations",
           STR(protein_identification.norm_PSMs_per_100K,7,3) AS "norm_PSMs_per_100K",
           protein_identification.n_distinct_peptides AS "n_distinct_peptides",
           biosequence_property_set.chromosome AS "chromosome",
           biosequence_property_set.genetic_locus AS "genetic_locus",
           biosequence_property_set.start_in_chromosome AS "start_in_chromosome",
           biosequence_property_set.end_in_chromosome AS "end_in_chromosome",
           biosequence_property_set.strand AS "strand",
           NULL AS "relationship_phrase",
           BS_SUBSUMED_BY.biosequence_name AS "reference_biosequence",
           BS_REP.biosequence_name AS "represented_by_biosequence_id",
           PID.protein_group_number AS "group_number",
           PID.seq_unique_prots_in_group AS "seq_unique_prots_in_group",
           NULL AS "protein_group_seq_align_link",
           NULL AS "is_keratin",
           NULL AS "is_immunoglobulin",
           CAST(BS_REF.biosequence_desc AS varchar(255)) AS "biosequence_description",
           DBX.accessor AS "biosequence_accessor",
           DBX.accessor_suffix AS "biosequence_accessor_suffix",
           organism.full_name AS "organism_full_name",
           PPL.sort_order AS "ppl_sort_order",
           NULL AS "brt_sort_order"
       FROM protein_identification
	 INNER JOIN atlas_build ON ( atlas_build.atlas_build_id = protein_identification.atlas_build_id )
	 INNER JOIN biosequence_set ON ( biosequence_set.biosequence_set_id = atlas_build.biosequence_set_id )
	 INNER JOIN organism ON ( organism.organism_id = biosequence_set.organism_id )
	 INNER JOIN PeptideAtlas_2.dbo.biosequence BS_REF ON ( BS_REF.biosequence_id = PID.biosequence_id )
         AND ( BS_REF.biosequence_set_id = BSS.biosequence_set_id)
	 INNER JOIN PeptideAtlas_2.dbo.biosequence BS_REP ON ( BS_REP.biosequence_id = PID.represented_by_biosequence_id )
         AND ( BS_REP.biosequence_set_id = BSS.biosequence_set_id)
	 LEFT JOIN BioLink.dbo.dbxref DBX ON ( DBX.dbxref_id = BS_REF.dbxref_id )
	 INNER JOIN PeptideAtlas_2.dbo.protein_presence_level PPL ON ( PPL.protein_presence_level_id = PID.presence_level_id )
		 LEFT JOIN PeptideAtlas_2.dbo.biosequence BS_SUBSUMED_BY ON ( BS_SUBSUMED_BY.biosequence_id = PID.subsumed_by_biosequence_id )
		 AND ( BS_SUBSUMED_BY.biosequence_set_id = BSS.biosequence_set_id)
		 LEFT JOIN biosequence_property_set BPS ON ( BPS.biosequence_id = PID.biosequence_id )
       WHERE 1 = 1
            AND AB.atlas_build_id IN ( 550 )
            AND ( BS_REF.biosequence_name LIKE $1
             )
            AND PPL.protein_presence_level_id IN ( 1 )
       )
				 UNION
			
     ( SELECT  
           BS_REL.biosequence_id AS "biosequence_id",
           BS_REL.biosequence_name AS "biosequence_name",
           BS_REL.biosequence_accession AS "biosequence_accession",
           BS_REL.biosequence_gene_name AS "biosequence_gene_name",
           NULL AS "is_covering",
           BR.related_biosequence_percentage_coverage AS "pct_coverage",
           NULL AS "presence_level",
           NULL AS "probability",
           NULL AS "confidence",
           NULL AS "n_observations",
           NULL AS "norm_PSMs_per_100K",
           NULL AS "n_distinct_peptides",
           BPS.chromosome AS "chromosome",
           BPS.genetic_locus AS "genetic_locus",
           BPS.start_in_chromosome AS "start_in_chromosome",
           BPS.end_in_chromosome AS "end_in_chromosome",
           BPS.strand AS "strand",
           BRT.relationship_phrase AS "relationship_phrase",
           BS_REF.biosequence_name AS "reference_biosequence",
           BS_REP.biosequence_name AS "represented_by_biosequence_id",
           PID.protein_group_number AS "group_number",
           PID.seq_unique_prots_in_group AS "seq_unique_prots_in_group",
           NULL AS "protein_group_seq_align_link",
           NULL AS "is_keratin",
           NULL AS "is_immunoglobulin",
           CAST(BS_REL.biosequence_desc AS varchar(255)) AS "biosequence_description",
           DBX.accessor AS "biosequence_accessor",
           DBX.accessor_suffix AS "biosequence_accessor_suffix",
           O.full_name AS "organism_full_name",
           PPL.sort_order AS "ppl_sort_order",
           BRT.sort_order AS "brt_sort_order"
       FROM PeptideAtlas_build550.dbo.protein_identification PID
		 INNER JOIN PeptideAtlas_build550.dbo.biosequence_relationship BR ON ( BR.reference_biosequence_id = PID.biosequence_id 
					 AND BR.atlas_build_id = PID.atlas_build_id )
	 INNER JOIN PeptideAtlas_2.dbo.atlas_build AB ON ( AB.atlas_build_id = PID.atlas_build_id )
	 INNER JOIN PeptideAtlas_2.dbo.biosequence_set BSS ON ( BSS.biosequence_set_id = AB.biosequence_set_id )
	 INNER JOIN sbeams.dbo.organism O ON ( O.organism_id = BSS.organism_id )
	 INNER JOIN PeptideAtlas_2.dbo.biosequence BS_REF ON ( BS_REF.biosequence_id = PID.biosequence_id )
         AND ( BS_REF.biosequence_set_id = BSS.biosequence_set_id)
	 INNER JOIN PeptideAtlas_2.dbo.biosequence BS_REP ON ( BS_REP.biosequence_id = PID.represented_by_biosequence_id )
         AND ( BS_REP.biosequence_set_id = BSS.biosequence_set_id)
	 LEFT JOIN BioLink.dbo.dbxref DBX ON ( DBX.dbxref_id = BS_REF.dbxref_id )
	 INNER JOIN PeptideAtlas_2.dbo.protein_presence_level PPL ON ( PPL.protein_presence_level_id = PID.presence_level_id )
	 INNER JOIN PeptideAtlas_2.dbo.biosequence_relationship_type BRT ON ( BRT.biosequence_relationship_type_id = BR.relationship_type_id )
	 LEFT JOIN PeptideAtlas_2.dbo.biosequence BS_REL ON ( BS_REL.biosequence_id = BR.related_biosequence_id )
				AND ( BS_REL.biosequence_set_id = BSS.biosequence_set_id )
	 LEFT JOIN PeptideAtlas_2.dbo.biosequence_property_set BPS ON ( BPS.biosequence_id = BS_REL.biosequence_id )
       WHERE 1 = 1
            AND AB.atlas_build_id IN ( 550 )
            AND ( BS_REL.biosequence_name LIKE $1
             )
            AND PPL.protein_presence_level_id IN ( 1 )
            AND BRT.biosequence_relationship_type_id IN ( 4 )
       )
				 UNION
			
     ( SELECT  
           BS_INDIS.biosequence_id AS "biosequence_id",
           BS_INDIS.biosequence_name AS "biosequence_name",
           BS_INDIS.biosequence_accession AS "biosequence_accession",
           BS_INDIS.biosequence_gene_name AS "biosequence_gene_name",
           NULL AS "is_covering",
           BR_INDIS.related_biosequence_percentage_coverage AS "pct_coverage",
           NULL AS "presence_level",
           NULL AS "probability",
           NULL AS "confidence",
           NULL AS "n_observations",
           NULL AS "norm_PSMs_per_100K",
           NULL AS "n_distinct_peptides",
           BPS.chromosome AS "chromosome",
           BPS.genetic_locus AS "genetic_locus",
           BPS.start_in_chromosome AS "start_in_chromosome",
           BPS.end_in_chromosome AS "end_in_chromosome",
           BPS.strand AS "strand",
           BRT.relationship_phrase AS "relationship_phrase",
           BS_REL.biosequence_name AS "reference_biosequence",
           BS_REP.biosequence_name AS "represented_by_biosequence_id",
           PID.protein_group_number AS "group_number",
           PID.seq_unique_prots_in_group AS "seq_unique_prots_in_group",
           NULL AS "protein_group_seq_align_link",
           NULL AS "is_keratin",
           NULL AS "is_immunoglobulin",
           CAST(BS_INDIS.biosequence_desc AS varchar(255)) AS "biosequence_description",
           DBX.accessor AS "biosequence_accessor",
           DBX.accessor_suffix AS "biosequence_accessor_suffix",
           O.full_name AS "organism_full_name",
           PPL.sort_order AS "ppl_sort_order",
           BRT.sort_order AS "brt_sort_order"
       FROM PeptideAtlas_build550.dbo.protein_identification PID
		INNER JOIN PeptideAtlas_build550.dbo.biosequence_relationship BR ON ( BR.reference_biosequence_id = PID.biosequence_id
					 AND BR.atlas_build_id = PID.atlas_build_id )
		INNER JOIN PeptideAtlas_build550.dbo.biosequence_relationship BR_INDIS ON ( BR_INDIS.reference_biosequence_id = BR.related_biosequence_id 
					 AND BR_INDIS.atlas_build_id = PID.atlas_build_id )
	 INNER JOIN PeptideAtlas_2.dbo.atlas_build AB ON ( AB.atlas_build_id = PID.atlas_build_id )
	 INNER JOIN PeptideAtlas_2.dbo.biosequence_set BSS ON ( BSS.biosequence_set_id = AB.biosequence_set_id )
	 INNER JOIN sbeams.dbo.organism O ON ( O.organism_id = BSS.organism_id )
	 INNER JOIN PeptideAtlas_2.dbo.biosequence BS_REF ON ( BS_REF.biosequence_id = PID.biosequence_id )
         AND ( BS_REF.biosequence_set_id = BSS.biosequence_set_id)
	 INNER JOIN PeptideAtlas_2.dbo.biosequence BS_REP ON ( BS_REP.biosequence_id = PID.represented_by_biosequence_id )
         AND ( BS_REP.biosequence_set_id = BSS.biosequence_set_id)
	 LEFT JOIN BioLink.dbo.dbxref DBX ON ( DBX.dbxref_id = BS_REF.dbxref_id )
	 INNER JOIN PeptideAtlas_2.dbo.protein_presence_level PPL ON ( PPL.protein_presence_level_id = PID.presence_level_id )
	 INNER JOIN PeptideAtlas_2.dbo.biosequence_relationship_type BRT ON ( BRT.biosequence_relationship_type_id = BR_INDIS.relationship_type_id )
	 LEFT JOIN PeptideAtlas_2.dbo.biosequence BS_INDIS ON ( BR_INDIS.related_biosequence_id = BS_INDIS.biosequence_id )
				AND ( BS_INDIS.biosequence_set_id = BSS.biosequence_set_id)
	 LEFT JOIN PeptideAtlas_2.dbo.biosequence BS_REL ON ( BS_REL.biosequence_id = BR_INDIS.reference_biosequence_id  )
  			AND ( BS_REL.biosequence_set_id = BSS.biosequence_set_id)
	 LEFT JOIN PeptideAtlas_2.dbo.biosequence_property_set BPS ON ( BPS.biosequence_id = BS_INDIS.biosequence_id )
       WHERE 1 = 1
            AND AB.atlas_build_id IN ( 550 )
            AND ( BS_INDIS.biosequence_name LIKE $1
             )
            AND PPL.protein_presence_level_id IN ( 1 )
            AND BRT.biosequence_relationship_type_id IN ( 4 )
       )
      ) PROT 
		LEFT JOIN (
		SELECT  
			PID.BIOSEQUENCE_ID, 
			CASE WHEN SUM(CAST (BPS.IS_KERATIN AS INTEGER)) OVER (PARTITION BY PID.REPRESENTED_BY_BIOSEQUENCE_ID) > 0  THEN 'ker' ELSE '' END AS "is_keratin",
			CASE WHEN SUM (CAST (BPS.is_immunoglobulin AS INTEGER)) OVER (PARTITION BY PID.REPRESENTED_BY_BIOSEQUENCE_ID) > 0  THEN 'Ig' ELSE '' END AS "is_immunoglobulin"
		FROM PeptideAtlas_build550.dbo.protein_identification  PID
		JOIN PeptideAtlas_2.dbo.biosequence_property_set BPS ON (BPS.BIOSEQUENCE_ID = PID.BIOSEQUENCE_ID ) 
		WHERE PID.ATLAS_BUILD_ID =550
    AND (BPS.IS_KERATIN != null or BPS.is_immunoglobulin != null)
  )IS_KER_IG ON (IS_KER_IG.biosequence_id = PROT.biosequence_id)
     ORDER BY
        group_number,
        ppl_sort_order,
        reference_biosequence,
        brt_sort_order,
        biosequence_name